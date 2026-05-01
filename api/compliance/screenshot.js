/* POST /api/compliance/screenshot
 *
 * Captures a full-page PNG of one of the public pages, uploads it to the
 * private Supabase Storage bucket "compliance-screenshots", and records
 * an audit row in compliance_log.
 *
 * Auth: requires a valid Supabase session (Authorization: Bearer <jwt>).
 *
 * Body:
 *   { page: "/our-people" }   // path on the site (leading slash optional)
 *
 * Response:
 *   {
 *     file: "screenshot-our-people-1713900000000.png",
 *     path: "2026/04/screenshot-our-people-1713900000000.png",
 *     signedUrl: "https://...supabase.co/storage/v1/object/sign/..."
 *   }
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional:
 *   SCREENSHOT_BASE_URL — the public base URL to screenshot (default:
 *     https://${VERCEL_URL}). Set this to your custom domain
 *     (e.g. https://steadfastwealth.com) to capture the live content.
 */

import { createClient } from "@supabase/supabase-js";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

const BUCKET = "compliance-screenshots";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

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

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." });
  }

  // ── 1. Auth ──────────────────────────────────────────────────
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing bearer token" });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResult?.user) return res.status(401).json({ error: "Invalid session" });
  const user = userResult.user;

  // ── 2. Resolve the URLs to screenshot ───────────────────────
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

  // ── 3. Launch Chromium once + capture each page ─────────────
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const runId = now.getTime();
  const captures = [];

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1440, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    for (const pagePath of pagePaths) {
      const targetUrl = cleanBase + pagePath;
      const page = await browser.newPage();
      try {
        await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 25000 });
        const buffer = await page.screenshot({ fullPage: true, type: "png" });
        const slug = pagePath.replace(/[^a-z0-9]/gi, "-").replace(/^-+|-+$/g, "") || "home";
        const filename = `archive-${runId}-${slug}.png`;
        const objectPath = `${yyyy}/${mm}/${runId}/${filename}`;
        const up = await admin.storage.from(BUCKET).upload(objectPath, buffer, {
          contentType: "image/png",
          upsert: false,
        });
        if (up.error) throw new Error(up.error.message);
        const signed = await admin.storage.from(BUCKET).createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
        captures.push({
          page: pagePath,
          target_url: targetUrl,
          file: filename,
          path: objectPath,
          signedUrl: signed.data?.signedUrl || null,
          ok: true,
        });
      } catch (err) {
        captures.push({
          page: pagePath,
          target_url: targetUrl,
          ok: false,
          error: err?.message || String(err),
        });
      } finally {
        await page.close().catch(() => {});
      }
    }
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: "Capture failed: " + (err.message || String(err)) });
  }
  await browser.close().catch(() => {});

  // ── 4. Audit log ────────────────────────────────────────────
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
