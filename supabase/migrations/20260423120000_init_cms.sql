-- Steadfast CMS — initial schema
-- Tables: articles, team_members, site_content, image_overrides, compliance_log
-- Plus: site-images storage bucket, RLS policies, updated_at triggers.

-- ── Extensions ──
create extension if not exists "pgcrypto";

-- ── updated_at trigger helper ──
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ══════════════════════════════════════════════
--  ARTICLES
-- ══════════════════════════════════════════════
create table if not exists public.articles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  date        date not null default current_date,
  category    text not null default 'commentary'
                check (category in ('commentary','planning','news')),
  summary     text not null default '',
  image       text default '',
  link        text default '',
  author      text default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists articles_date_idx on public.articles (date desc);

drop trigger if exists articles_set_updated_at on public.articles;
create trigger articles_set_updated_at
  before update on public.articles
  for each row execute function public.tg_set_updated_at();

-- ══════════════════════════════════════════════
--  TEAM MEMBERS
-- ══════════════════════════════════════════════
create table if not exists public.team_members (
  id          uuid primary key default gen_random_uuid(),
  sort_order  int not null default 0,
  name        text not null,
  title       text not null,
  creds       text default '',
  bio         text default '',
  education   text default '',
  personal    text default '',
  photo       text default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists team_members_sort_idx on public.team_members (sort_order);

drop trigger if exists team_members_set_updated_at on public.team_members;
create trigger team_members_set_updated_at
  before update on public.team_members
  for each row execute function public.tg_set_updated_at();

-- ══════════════════════════════════════════════
--  SITE CONTENT (key/value)
-- ══════════════════════════════════════════════
create table if not exists public.site_content (
  key         text primary key,
  value       text not null default '',
  updated_at  timestamptz not null default now()
);

drop trigger if exists site_content_set_updated_at on public.site_content;
create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute function public.tg_set_updated_at();

-- ══════════════════════════════════════════════
--  IMAGE OVERRIDES
-- ══════════════════════════════════════════════
create table if not exists public.image_overrides (
  original    text primary key,
  replacement text not null,
  updated_at  timestamptz not null default now()
);

drop trigger if exists image_overrides_set_updated_at on public.image_overrides;
create trigger image_overrides_set_updated_at
  before update on public.image_overrides
  for each row execute function public.tg_set_updated_at();

-- ══════════════════════════════════════════════
--  COMPLIANCE LOG (append-only audit trail)
-- ══════════════════════════════════════════════
create table if not exists public.compliance_log (
  id         bigserial primary key,
  timestamp  timestamptz not null default now(),
  action     text not null,
  detail     jsonb default '{}'::jsonb
);

create index if not exists compliance_log_timestamp_idx on public.compliance_log (timestamp desc);

-- ══════════════════════════════════════════════
--  ROW LEVEL SECURITY
--  anon: read-only on public content tables
--  authenticated: full CRUD
-- ══════════════════════════════════════════════
alter table public.articles         enable row level security;
alter table public.team_members     enable row level security;
alter table public.site_content     enable row level security;
alter table public.image_overrides  enable row level security;
alter table public.compliance_log   enable row level security;

-- Public read
drop policy if exists "public_read_articles"        on public.articles;
drop policy if exists "public_read_team"            on public.team_members;
drop policy if exists "public_read_content"         on public.site_content;
drop policy if exists "public_read_image_overrides" on public.image_overrides;

create policy "public_read_articles"
  on public.articles for select to anon, authenticated using (true);
create policy "public_read_team"
  on public.team_members for select to anon, authenticated using (true);
create policy "public_read_content"
  on public.site_content for select to anon, authenticated using (true);
create policy "public_read_image_overrides"
  on public.image_overrides for select to anon, authenticated using (true);

-- Authenticated write (admin)
drop policy if exists "auth_write_articles"        on public.articles;
drop policy if exists "auth_write_team"            on public.team_members;
drop policy if exists "auth_write_content"         on public.site_content;
drop policy if exists "auth_write_image_overrides" on public.image_overrides;
drop policy if exists "auth_insert_compliance_log" on public.compliance_log;
drop policy if exists "auth_read_compliance_log"   on public.compliance_log;

create policy "auth_write_articles"
  on public.articles for all to authenticated using (true) with check (true);
create policy "auth_write_team"
  on public.team_members for all to authenticated using (true) with check (true);
create policy "auth_write_content"
  on public.site_content for all to authenticated using (true) with check (true);
create policy "auth_write_image_overrides"
  on public.image_overrides for all to authenticated using (true) with check (true);
create policy "auth_insert_compliance_log"
  on public.compliance_log for insert to authenticated with check (true);
create policy "auth_read_compliance_log"
  on public.compliance_log for select to authenticated using (true);

-- ══════════════════════════════════════════════
--  STORAGE — site-images bucket (public read, authed write)
-- ══════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do nothing;

drop policy if exists "site_images_public_read"   on storage.objects;
drop policy if exists "site_images_auth_insert"   on storage.objects;
drop policy if exists "site_images_auth_update"   on storage.objects;
drop policy if exists "site_images_auth_delete"   on storage.objects;

create policy "site_images_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'site-images');

create policy "site_images_auth_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'site-images');

create policy "site_images_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'site-images') with check (bucket_id = 'site-images');

create policy "site_images_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'site-images');
