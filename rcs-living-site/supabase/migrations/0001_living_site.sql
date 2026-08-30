-- Living site storage: one config per day, plus the announcements the curator
-- may draw on. Apply with the Supabase SQL editor or `supabase db push`.
--
-- After applying, add `living_site` to Settings -> API -> Exposed schemas in
-- the Supabase dashboard, or PostgREST will not serve these tables.

create schema if not exists living_site;

grant usage on schema living_site to anon, authenticated, service_role;

-- One edition per day. `config` holds a whole SiteConfig object; it is
-- re-validated on read, so a row that stops satisfying the design rules is
-- skipped rather than rendered.
create table if not exists living_site.configs (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  config jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists configs_date_desc_idx
  on living_site.configs (date desc);

-- Studio news the curator folds into an edition. A null bound means open-ended.
create table if not exists living_site.announcements (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  active boolean not null default true,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  constraint announcements_window_valid
    check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create index if not exists announcements_active_idx
  on living_site.announcements (active, starts_on, ends_on)
  where active;

alter table living_site.configs enable row level security;
alter table living_site.announcements enable row level security;

-- Editions are public: the site reads them with the anon key.
drop policy if exists "configs are publicly readable" on living_site.configs;
create policy "configs are publicly readable"
  on living_site.configs
  for select
  to anon, authenticated
  using (true);

-- Announcements carry unpublished studio news, so they stay private. Only the
-- service role reads them, and only the generator writes anything at all --
-- there is deliberately no insert/update/delete policy for anon.
grant select on living_site.configs to anon, authenticated;
grant select, insert, update, delete on living_site.configs to service_role;
grant select, insert, update, delete on living_site.announcements to service_role;

-- Future tables in this schema are usable by the generator without another grant.
alter default privileges for role postgres in schema living_site
  grant select, insert, update, delete on tables to service_role;

alter default privileges for role postgres in schema living_site
  grant usage, select on sequences to service_role;
