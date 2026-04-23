/* Supabase client for the Steadfast admin panel.
 * Uses the publishable (anon) key — safe to ship in the browser. RLS policies
 * in the database enforce who can read/write. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const SUPABASE_URL = "https://icadtxymobeodnegujir.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QSHOGHVeJS6v5OdAiZ7log_VMxrmaN5";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "steadfast-admin-auth",
  },
});

export async function requireSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.replace("/admin/login.html");
    return null;
  }
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.replace("/admin/login.html");
}

export function escapeHtml(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
