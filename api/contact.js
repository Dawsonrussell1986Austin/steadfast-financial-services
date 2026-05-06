/* POST /api/contact
 *
 * Accepts contact-form submissions from index.html and contact-us.html and
 * writes them to the Supabase `contact_submissions` table using the service
 * role key. The admin panel reads them back to render the inbox.
 *
 * Also notifies the firm by email via Resend (if RESEND_API_KEY is set).
 *
 * Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional env vars (for email notification):
 *   RESEND_API_KEY  — API key from resend.com
 *   RESEND_FROM     — verified sender, e.g. "Steadfast Website <noreply@steadfastwealth.com>"
 *   CONTACT_NOTIFY  — comma-separated override list (defaults to paul@ + matt@)
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

  // Best-effort email notification — never block the form on this.
  let emailStatus = "skipped";
  let emailError = null;
  try {
    const result = await sendNotification({
      name: fullName,
      email,
      phone,
      message,
      source,
      ip,
    });
    emailStatus = result.status;
    if (result.error) emailError = result.error;
  } catch (err) {
    emailStatus = "error";
    emailError = err?.message || String(err);
    console.error("[contact] email send failed", err);
  }

  return res.status(200).json({
    ok: true,
    storedIn: primaryError ? "compliance_log" : "contact_submissions",
    email: emailStatus,
    ...(emailError ? { emailError } : {}),
  });
}

async function sendNotification({ name, email, phone, message, source, ip }) {
  const { RESEND_API_KEY, RESEND_FROM, CONTACT_NOTIFY } = process.env;
  if (!RESEND_API_KEY || !RESEND_FROM) {
    return { status: "skipped", error: "RESEND_API_KEY or RESEND_FROM not configured" };
  }
  const recipients = (CONTACT_NOTIFY || "paul@steadfastwealth.com, matt@steadfastwealth.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!recipients.length) return { status: "skipped", error: "No recipients" };

  const escape = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const safeMessage = escape(message).replace(/\n/g, "<br/>");
  const subject = "New contact form submission — " + name;
  const html =
    "<div style=\"font-family:Inter,Arial,sans-serif;max-width:600px;color:#1c2624;\">" +
    "<h2 style=\"margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;\">New website inquiry</h2>" +
    "<p style=\"margin:0 0 16px;color:#5c6a63;\">Submitted via " + escape(source) + "</p>" +
    "<table style=\"border-collapse:collapse;width:100%;margin-bottom:16px;\">" +
    row("Name", escape(name)) +
    row("Email", '<a href="mailto:' + escape(email) + '">' + escape(email) + "</a>") +
    (phone ? row("Phone", escape(phone)) : "") +
    "</table>" +
    "<h3 style=\"margin:16px 0 8px;\">Message</h3>" +
    "<div style=\"white-space:pre-wrap;background:#f5f3ee;padding:12px 14px;border-radius:6px;\">" + safeMessage + "</div>" +
    (ip ? "<p style=\"margin-top:24px;color:#8a958f;font-size:12px;\">IP: " + escape(ip) + "</p>" : "") +
    "</div>";
  const text =
    "New website inquiry (" + source + ")\n\n" +
    "Name: " + name + "\n" +
    "Email: " + email + "\n" +
    (phone ? "Phone: " + phone + "\n" : "") +
    "\nMessage:\n" + message + "\n";

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: recipients,
      reply_to: email,
      subject,
      html,
      text,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { status: "error", error: body?.message || ("Resend " + r.status) };
  }
  return { status: "sent", id: body?.id };
}

function row(label, value) {
  return (
    "<tr>" +
    "<td style=\"padding:6px 12px 6px 0;color:#5c6a63;font-size:13px;vertical-align:top;width:80px;\">" + label + "</td>" +
    "<td style=\"padding:6px 0;\">" + value + "</td>" +
    "</tr>"
  );
}
