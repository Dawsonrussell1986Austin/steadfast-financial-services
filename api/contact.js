/* POST /api/contact
 *
 * Accepts contact-form submissions from index.html and contact-us.html and
 * writes them to the Supabase `contact_submissions` table using the service
 * role key. The admin panel reads them back to render the inbox.
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Expected body (JSON):
 *   { firstName, lastName, name, email, phone, message, source }
 */

import { createClient } from "@supabase/supabase-js";

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server missing Supabase credentials" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const trim = (v) => (typeof v === "string" ? v.trim() : "");
  const firstName = trim(body.firstName);
  const lastName = trim(body.lastName);
  const fallbackName = trim(body.name);
  const composed = [firstName, lastName].filter(Boolean).join(" ");
  const fullName = composed || fallbackName;
  const email = trim(body.email);
  const phone = trim(body.phone);
  const message = trim(body.message);
  const source = trim(body.source) || "contact-form";

  if (!fullName || !email || !message) {
    return res.status(400).json({ error: "Name, email, and message are required." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address." });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    null;
  const userAgent = req.headers["user-agent"] || null;

  const payload = {
    name: fullName,
    first_name: firstName || null,
    last_name: lastName || null,
    email,
    phone: phone || null,
    message,
    source,
    ip,
    user_agent: userAgent,
  };

  // Primary store: dedicated contact_submissions table.
  let primaryError = null;
  const primary = await admin.from("contact_submissions").insert(payload);
  if (primary.error) primaryError = primary.error;

  // Always mirror into compliance_log so the message is captured even if the
  // dedicated table is missing or RLS blocks the insert. Admin Messages reads
  // from this fallback too.
  const logRes = await admin.from("compliance_log").insert({
    action: "contact_submission",
    detail: {
      name: fullName,
      first_name: firstName || null,
      last_name: lastName || null,
      email,
      phone: phone || null,
      message,
      source,
      ip,
      user_agent: userAgent,
    },
  });

  if (primaryError && logRes.error) {
    return res.status(500).json({
      error:
        "Save failed: " +
        primaryError.message +
        (logRes.error ? " | log: " + logRes.error.message : ""),
    });
  }

  return res.status(200).json({
    ok: true,
    storedIn: primaryError ? "compliance_log" : "contact_submissions",
  });
}
