/* Vercel serverless function: POST /api/publish
 *
 * Flow:
 *   1. Verify the caller has a valid Supabase session (Authorization: Bearer <jwt>).
 *   2. Read current CMS state from Supabase with the service role key.
 *   3. Generate data/articles.json, data/team.json, data/content.json,
 *      data/image-overrides.json.
 *   4. Commit those four files to the repo via the GitHub Git Data API in a
 *      single atomic commit. Vercel picks up the push and redeploys.
 *
 * Required env vars (set in Vercel dashboard → Project Settings → Environment Variables):
 *   SUPABASE_URL                 — https://icadtxymobeodnegujir.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    — server-only; never expose to the browser
 *   GITHUB_TOKEN                 — PAT with `contents: write` on the repo
 *   GITHUB_REPO                  — e.g. "Dawsonrussell1986Austin/steadfast-financial-services"
 *   GITHUB_BRANCH                — branch to commit to (default: "main")
 */

import { createClient } from "@supabase/supabase-js";

const RESERVED_KEYS = new Set(["client_links"]);

export default async function handler(req, res) {
  try {
    return await run(req, res);
  } catch (err) {
    console.error("[publish] uncaught", err);
    return res.status(500).json({ error: err?.message || String(err), stack: err?.stack });
  }
}

async function run(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    GITHUB_TOKEN,
    GITHUB_REPO,
    GITHUB_BRANCH = "main",
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({
      error:
        "Server not configured. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GITHUB_TOKEN, and GITHUB_REPO in Vercel env.",
    });
  }

  // ── 1. Verify caller is authenticated ───────────────────────
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userErr } = await adminClient.auth.getUser(token);
  if (userErr || !userResult?.user) {
    return res.status(401).json({ error: "Invalid session" });
  }
  const user = userResult.user;

  try {
    // ── 2. Read current CMS state ─────────────────────────────
    const [articlesR, teamR, contentR, overridesR] = await Promise.all([
      adminClient
        .from("articles")
        .select("id, title, date, category, summary, image, link, author")
        .order("date", { ascending: false }),
      adminClient
        .from("team_members")
        .select("sort_order, name, title, creds, bio, education, personal, photo")
        .order("sort_order", { ascending: true }),
      adminClient.from("site_content").select("key, value"),
      adminClient.from("image_overrides").select("original, replacement"),
    ]);

    for (const r of [articlesR, teamR, contentR, overridesR]) {
      if (r.error) throw new Error("Supabase read failed: " + r.error.message);
    }

    // ── 3. Shape JSON files ───────────────────────────────────
    const articlesJson = (articlesR.data || []).map((a) => ({
      id: a.id,
      title: a.title || "",
      date: typeof a.date === "string" ? a.date : new Date(a.date).toISOString().slice(0, 10),
      category: a.category || "commentary",
      summary: a.summary || "",
      image: a.image || "",
      link: a.link || "",
      author: a.author || "",
    }));

    const teamJson = (teamR.data || []).map((m) => ({
      name: m.name || "",
      title: m.title || "",
      creds: m.creds || "",
      bio: m.bio || "",
      education: m.education || "",
      personal: m.personal || "",
      photo: m.photo || "",
    }));

    const contentJson = {};
    for (const row of contentR.data || []) {
      if (!RESERVED_KEYS.has(row.key)) contentJson[row.key] = row.value || "";
    }

    let linksJson = [];
    const linksRow = (contentR.data || []).find((r) => r.key === "client_links");
    if (linksRow && linksRow.value) {
      try {
        const parsed = JSON.parse(linksRow.value);
        if (Array.isArray(parsed)) linksJson = parsed;
      } catch (e) {}
    }

    const overridesJson = {};
    for (const r of overridesR.data || []) overridesJson[r.original] = r.replacement;

    const files = [
      { path: "data/articles.json",         content: JSON.stringify(articlesJson, null, 2) + "\n" },
      { path: "data/team.json",             content: JSON.stringify(teamJson, null, 2) + "\n" },
      { path: "data/content.json",          content: JSON.stringify(contentJson, null, 2) + "\n" },
      { path: "data/links.json",            content: JSON.stringify(linksJson, null, 2) + "\n" },
      { path: "data/image-overrides.json",  content: JSON.stringify(overridesJson, null, 2) + "\n" },
    ];

    // ── 4. Commit via GitHub Git Data API (single atomic commit) ──
    const gh = githubClient(GITHUB_TOKEN, GITHUB_REPO);

    // Get current branch ref
    const ref = await gh(`git/ref/heads/${encodeURIComponent(GITHUB_BRANCH)}`);
    const baseSha = ref.object.sha;
    const baseCommit = await gh(`git/commits/${baseSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    // Create blobs in parallel
    const blobs = await Promise.all(
      files.map((f) =>
        gh("git/blobs", {
          method: "POST",
          body: JSON.stringify({ content: f.content, encoding: "utf-8" }),
        })
      )
    );

    // Build a new tree
    const tree = await gh("git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: files.map((f, i) => ({
          path: f.path,
          mode: "100644",
          type: "blob",
          sha: blobs[i].sha,
        })),
      }),
    });

    const commit = await gh("git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: `chore(cms): publish content via admin\n\nBy ${user.email || user.id}`,
        tree: tree.sha,
        parents: [baseSha],
      }),
    });

    await gh(`git/refs/heads/${encodeURIComponent(GITHUB_BRANCH)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });

    // Audit
    await adminClient.from("compliance_log").insert({
      action: "content_published",
      detail: {
        commit: commit.sha,
        branch: GITHUB_BRANCH,
        by: user.email || user.id,
        files: files.map((f) => f.path),
      },
    });

    return res.status(200).json({
      ok: true,
      commit: commit.sha,
      branch: GITHUB_BRANCH,
      files: files.map((f) => f.path),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
}

function githubClient(token, repo) {
  return async function gh(path, opts = {}) {
    const url = `https://api.github.com/repos/${repo}/${path}`;
    const r = await fetch(url, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "steadfast-cms-publish",
        ...(opts.headers || {}),
      },
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = body.message || r.statusText;
      throw new Error(`GitHub ${opts.method || "GET"} ${path} → ${r.status}: ${msg}`);
    }
    return body;
  };
}
