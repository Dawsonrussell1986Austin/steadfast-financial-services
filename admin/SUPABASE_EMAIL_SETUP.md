# Supabase email setup (one-time)

Magic-link sign-in and admin invites both go through Supabase Auth's
default email sender. To make the emails look like they come from
Steadfast Wealth, do this once in the Supabase Dashboard.

## 1. Set the sender name

Dashboard → **Project Settings → Authentication → SMTP Settings**

- **Sender name:** `Steadfast Wealth`
- (Address can stay as Supabase's default `noreply@mail.app.supabase.io`
  unless you want to wire up custom SMTP via Resend / Postmark / SendGrid.)

## 2. Set the redirect URL

Dashboard → **Authentication → URL Configuration**

- **Site URL:** `https://steadfastwealth.com`
- Under **Redirect URLs**, add:
  - `https://steadfastwealth.com/admin/login.html`
  - `http://localhost:3000/admin/login.html` (if you ever run locally)

## 3. Customize the email templates

Dashboard → **Authentication → Email Templates**

Two templates matter:

- **Magic Link** — sent when an existing admin signs in.
- **Invite user** — sent when you invite a new teammate from the
  CMS "Team Access" panel.

Paste the HTML from `admin/email-templates/magic-link.html` and
`admin/email-templates/invite.html` into each. The `{{ .ConfirmationURL }}`
placeholder is filled in by Supabase automatically.

## 4. Vercel env vars

Set these in Vercel → Project Settings → Environment Variables (already
required for the `/api/publish` and `/api/compliance/screenshot`
functions):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_INVITE_REDIRECT` — `https://steadfastwealth.com/admin/login.html`
