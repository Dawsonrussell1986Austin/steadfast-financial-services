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

  // ── 2. Resolve the URL to screenshot ────────────────────────
  const rawPage = (req.body?.page ?? "/").trim() || "/";
  const pagePath = rawPage.startsWith("/") ? rawPage : "/" + rawPage;
  const baseUrl =
    process.env.SCREENSHOT_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!baseUrl) {
    return res.status(500).json({
      error: "No base URL available. Set SCREENSHOT_BASE_URL or deploy on Vercel.",
    });
  }
  const targetUrl = baseUrl.replace(/\/$/, "") + pagePath;

  // ── 3. Launch Chromium + capture ────────────────────────────
  let browser;
  let buffer;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1440, height: 900 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 25000 });
    buffer = await page.screenshot({ fullPage: true, type: "png" });
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: "Capture failed: " + (err.message || String(err)) });
  }
  await browser.close().catch(() => {});

  // ── 4. Upload to Supabase Storage ───────────────────────────
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const slug = pagePath.replace(/[^a-z0-9]/gi, "-").replace(/^-+|-+$/g, "") || "home";
  const filename = `screenshot-${slug}-${now.getTime()}.png`;
  const objectPath = `${yyyy}/${mm}/${filename}`;

  const up = await admin.storage.from(BUCKET).upload(objectPath, buffer, {
    contentType: "image/png",
    upsert: false,
  });
  if (up.error) {
    return res.status(500).json({ error: "Storage upload failed: " + up.error.message });
  }

  const signed = await admin.storage.from(BUCKET).createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
  const signedUrl = signed.data?.signedUrl || null;

  // ── 5. Audit log ────────────────────────────────────────────
  await admin.from("compliance_log").insert({
    action: "screenshot_taken",
    detail: {
      page: pagePath,
      target_url: targetUrl,
      bucket: BUCKET,
      path: objectPath,
      by: user.email || user.id,
    },
  });

  return res.status(200).json({
    file: filename,
    path: objectPath,
    signedUrl,
    targetUrl,
  });
}
