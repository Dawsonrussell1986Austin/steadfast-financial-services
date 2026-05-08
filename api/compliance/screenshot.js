/* POST /api/compliance/screenshot
 *
 * Captures full-page PNGs of public site pages by calling the ScreenshotOne
 * API, uploads each to the private Supabase Storage bucket
 * "compliance-screenshots", and records an audit row in compliance_log.
 *
 * Auth: requires a valid Supabase session (Authorization: Bearer <jwt>).
 *
 * Body:
 *   { pages: ["/", "/our-people", ...], runId: 1778... }   // pages OR
 *   { page: "/our-people", runId: 1778... }                // single page
 *
 * Response:
 *   { runId, captures: [{ page, file, path, signedUrl, ok, error? }, ...],
 *     okCount, failCount }
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   SCREENSHOTONE_ACCESS_KEY  — public access key
 *   SCREENSHOTONE_SECRET_KEY  — secret used to HMAC-sign requests
 * Optional:
 *   SCREENSHOT_BASE_URL — public base URL of the site (default: VERCEL_URL)
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const BUCKET = "compliance-screenshots";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  try {
    return await run(req, res);
  } catch (err) {
    console.error("[screenshot] uncaught", err);
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
    SCREENSHOTONE_ACCESS_KEY,
    SCREENSHOTONE_SECRET_KEY,
    // Back-compat with the older single-key env name.
    SCREENSHOTONE_API_KEY,
  } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." });
  }
  const accessKey = SCREENSHOTONE_ACCESS_KEY || SCREENSHOTONE_API_KEY;
  if (!accessKey) {
    return res.status(500).json({ error: "Server missing SCREENSHOTONE_ACCESS_KEY env var." });
  }
  if (!SCREENSHOTONE_SECRET_KEY) {
    return res.status(500).json({ error: "Server missing SCREENSHOTONE_SECRET_KEY env var." });
  }

  // ── Auth ──────────────────────────────────────────────────
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResult?.user) return res.status(401).json({ error: "Invalid session" });
  const user = userResult.user;

  // ── Resolve pages and base URL ────────────────────────────
  const DEFAULT_PAGES = [
    "/",
    "/financial-planning",
    "/investment-management",
    "/our-people",
    "/resources",
    "/articles",
    "/links",
    "/contact-us",
  ];
  const requested = Array.isArray(req.body?.pages) && req.body.pages.length
    ? req.body.pages
    : req.body?.page
    ? [req.body.page]
    : DEFAULT_PAGES;
  const pagePaths = requested.map((p) => {
    const s = String(p || "/").trim() || "/";
    return s.startsWith("/") ? s : "/" + s;
  });
  const baseUrl =
    process.env.SCREENSHOT_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!baseUrl) {
    return res.status(500).json({
      error: "No base URL available. Set SCREENSHOT_BASE_URL or deploy on Vercel.",
    });
  }
  const cleanBase = baseUrl.replace(/\/$/, "");

  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const runId = Number.isFinite(req.body?.runId) ? req.body.runId : now.getTime();

  // ── Capture each page in parallel via ScreenshotOne ───────
  const captures = await Promise.all(
    pagePaths.map(async (pagePath) => {
      const targetUrl = cleanBase + pagePath;
      try {
        // Build query string in a fixed order, sign with HMAC-SHA256.
        const params = new URLSearchParams();
        params.set("access_key", accessKey);
        params.set("url", targetUrl);
        params.set("full_page", "true");
        params.set("format", "png");
        params.set("viewport_width", "1440");
        params.set("viewport_height", "900");
        params.set("block_ads", "true");
        params.set("block_cookie_banners", "true");
        params.set("delay", "2");
        params.set("cache", "false");
        params.set("response_type", "by_format");
        params.set("image_quality", "85");
        const query = params.toString();
        const signature = crypto
          .createHmac("sha256", SCREENSHOTONE_SECRET_KEY)
          .update(query)
          .digest("hex");
        const apiUrlString = "https://api.screenshotone.com/take?" + query + "&signature=" + signature;

        const r = await fetch(apiUrlString);
        if (!r.ok) {
          let detail = "";
          try {
            const body = await r.text();
            try {
              const parsed = JSON.parse(body);
              detail = parsed?.error_message || parsed?.error || body.slice(0, 200);
            } catch (e) {
              detail = body.slice(0, 200);
            }
          } catch (e) {}
          throw new Error("ScreenshotOne " + r.status + (detail ? ": " + detail : ""));
        }
        const arrayBuffer = await r.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const slug = pagePath.replace(/[^a-z0-9]/gi, "-").replace(/^-+|-+$/g, "") || "home";
        const filename = `archive-${runId}-${slug}.png`;
        const objectPath = `${yyyy}/${mm}/${runId}/${filename}`;
        const up = await admin.storage.from(BUCKET).upload(objectPath, buffer, {
          contentType: "image/png",
          upsert: false,
        });
        if (up.error) throw new Error("Upload failed: " + up.error.message);
        const signed = await admin.storage.from(BUCKET).createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
        return {
          page: pagePath,
          target_url: targetUrl,
          file: filename,
          path: objectPath,
          signedUrl: signed.data?.signedUrl || null,
          ok: true,
        };
      } catch (err) {
        return {
          page: pagePath,
          target_url: targetUrl,
          ok: false,
          error: err?.message || String(err),
        };
      }
    })
  );

  // ── Audit log ────────────────────────────────────────────
  const ok = captures.filter((c) => c.ok);
  const failed = captures.filter((c) => !c.ok);
  await admin.from("compliance_log").insert({
    action: "screenshot_archive",
    detail: {
      run_id: runId,
      pages_captured: ok.map((c) => c.page),
      pages_failed: failed.map((c) => ({ page: c.page, error: c.error })),
      bucket: BUCKET,
      base_url: cleanBase,
      provider: "screenshotone",
      by: user.email || user.id,
    },
  });

  return res.status(200).json({
    runId,
    captures,
    okCount: ok.length,
    failCount: failed.length,
  });
}
