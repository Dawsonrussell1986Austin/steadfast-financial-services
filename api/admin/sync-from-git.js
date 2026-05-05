/* POST /api/admin/sync-from-git
 *
 * One-shot reconciliation: read the live data/*.json files from the
 * repo on GitHub and overwrite the Supabase CMS rows with their
 * contents. After running this, Supabase reflects git, so the next
 * /api/publish (which reads Supabase and writes git) will not clobber
 * any direct git edits that pre-dated it.
 *
 * Auth: requires a valid Supabase session. Same gating as /api/publish.
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   GITHUB_TOKEN, GITHUB_REPO
 *   GITHUB_BRANCH (default: main)
 */

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    return await run(req, res);
  } catch (err) {
    console.error("[sync-from-git] uncaught", err);
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

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResult?.user) return res.status(401).json({ error: "Invalid session" });
  const user = userResult.user;

  const fetchFile = async (path) => {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${path}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
    const r = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.raw",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "steadfast-cms-sync",
      },
    });
    if (!r.ok) throw new Error(`GitHub GET ${path} → ${r.status}`);
    const text = await r.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Failed to parse ${path}: ${e.message}`);
    }
  };

  const counts = { team: 0, content: 0, image_overrides: 0, articles: 0 };

  try {
    const [team, content, overrides, articles] = await Promise.all([
      fetchFile("data/team.json"),
      fetchFile("data/content.json"),
      fetchFile("data/image-overrides.json"),
      fetchFile("data/articles.json").catch(() => []),
    ]);

    // ── team_members: replace wholesale (preserves uuids by name match) ──
    if (Array.isArray(team)) {
      const existingR = await admin.from("team_members").select("id, name");
      if (existingR.error) throw new Error(existingR.error.message);
      const byName = new Map((existingR.data || []).map((r) => [r.name, r.id]));

      const seenNames = new Set();
      for (let i = 0; i < team.length; i++) {
        const m = team[i];
        if (!m?.name) continue;
        seenNames.add(m.name);
        const row = {
          sort_order: i,
          name: m.name,
          title: m.title || "",
          creds: m.creds || "",
          bio: m.bio || "",
          education: m.education || "",
          personal: m.personal || "",
          photo: m.photo || "",
        };
        const existingId = byName.get(m.name);
        const op = existingId
          ? admin.from("team_members").update(row).eq("id", existingId)
          : admin.from("team_members").insert(row);
        const r = await op;
        if (r.error) throw new Error(`team upsert (${m.name}): ${r.error.message}`);
        counts.team++;
      }
      // Remove rows not present in git
      for (const [name, id] of byName) {
        if (!seenNames.has(name)) {
          const del = await admin.from("team_members").delete().eq("id", id);
          if (del.error) throw new Error(`team delete (${name}): ${del.error.message}`);
        }
      }
    }

    // ── site_content: upsert each key from git ──
    if (content && typeof content === "object") {
      const rows = Object.entries(content).map(([key, value]) => ({
        key,
        value: typeof value === "string" ? value : JSON.stringify(value),
      }));
      if (rows.length) {
        const r = await admin.from("site_content").upsert(rows, { onConflict: "key" });
        if (r.error) throw new Error(`site_content upsert: ${r.error.message}`);
        counts.content = rows.length;
      }
    }

    // ── image_overrides: replace wholesale ──
    {
      const del = await admin.from("image_overrides").delete().neq("original", "");
      if (del.error) throw new Error(`image_overrides clear: ${del.error.message}`);
      const rows = Object.entries(overrides || {}).map(([original, replacement]) => ({
        original,
        replacement,
      }));
      if (rows.length) {
        const r = await admin.from("image_overrides").insert(rows);
        if (r.error) throw new Error(`image_overrides insert: ${r.error.message}`);
        counts.image_overrides = rows.length;
      }
    }

    // ── articles: upsert by id ──
    if (Array.isArray(articles) && articles.length) {
      const rows = articles.map((a) => ({
        id: a.id,
        title: a.title || "",
        date: a.date || null,
        category: a.category || "commentary",
        summary: a.summary || "",
        image: a.image || "",
        link: a.link || "",
        author: a.author || "",
      }));
      const r = await admin.from("articles").upsert(rows, { onConflict: "id" });
      if (r.error) throw new Error(`articles upsert: ${r.error.message}`);
      counts.articles = rows.length;
    }

    await admin.from("compliance_log").insert({
      action: "supabase_synced_from_git",
      detail: { branch: GITHUB_BRANCH, by: user.email || user.id, counts },
    });

    return res.status(200).json({ ok: true, counts });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err), counts });
  }
}
