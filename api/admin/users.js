/* Vercel serverless function: admin user management.
 *
 * GET    /api/admin/users        → list current admins (auth.users)
 * POST   /api/admin/users        → invite a new admin
 *                                  body: { email: "person@firm.com" }
 * DELETE /api/admin/users?id=…   → remove an admin
 *
 * All three require a valid Supabase session (Authorization: Bearer <jwt>).
 * Any signed-in user counts as an admin (matches the project's RLS model);
 * the caller cannot remove their own account.
 *
 * Required env vars (set in Vercel → Project Settings → Environment Variables):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY    — server-only; never expose to the browser
 *   ADMIN_INVITE_REDIRECT        — optional, e.g. https://steadfastwealth.com/admin/login.html
 */

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    return await run(req, res);
  } catch (err) {
    console.error("[admin/users] uncaught", err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}

async function run(req, res) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_INVITE_REDIRECT } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({
      error: "Server missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Auth gate ─────────────────────────────────────────────────
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller?.user) return res.status(401).json({ error: "Invalid session" });
  const callerUser = caller.user;

  // ── GET: list admins ──────────────────────────────────────────
  if (req.method === "GET") {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return res.status(500).json({ error: error.message });
    const users = (data?.users || []).map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      invited_at: u.invited_at,
      confirmed_at: u.confirmed_at || u.email_confirmed_at,
      is_self: u.id === callerUser.id,
    }));
    return res.status(200).json({ users });
  }

  // ── POST: invite a new admin ──────────────────────────────────
  if (req.method === "POST") {
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email required." });
    }
    const redirectTo =
      ADMIN_INVITE_REDIRECT ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/admin/login.html` : undefined);
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ user: { id: data.user?.id, email: data.user?.email } });
  }

  // ── DELETE: remove an admin ───────────────────────────────────
  if (req.method === "DELETE") {
    const id = (req.query?.id || "").toString();
    if (!id) return res.status(400).json({ error: "Missing user id." });
    if (id === callerUser.id) {
      return res.status(400).json({ error: "You cannot remove your own access." });
    }
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
