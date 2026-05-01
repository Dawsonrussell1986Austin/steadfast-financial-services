-- Contact form inbox.
-- Submissions arrive through the public /api/contact endpoint, which uses the
-- service role to insert. Reads are restricted to authenticated admin users.

create table if not exists public.contact_submissions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  name         text not null,
  first_name   text,
  last_name    text,
  email        text not null,
  phone        text,
  message      text not null,
  source       text default 'contact-form',
  ip           text,
  user_agent   text
);

create index if not exists contact_submissions_created_at_idx
  on public.contact_submissions (created_at desc);

alter table public.contact_submissions enable row level security;

-- Admins (signed-in users) can read the inbox.
drop policy if exists "Authenticated read contact submissions"
  on public.contact_submissions;
create policy "Authenticated read contact submissions"
  on public.contact_submissions
  for select
  to authenticated
  using (true);
