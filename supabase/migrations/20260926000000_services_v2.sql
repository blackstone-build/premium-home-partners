-- Premium Home Partners: Services v2 (docs/SERVICES_V2.md).
-- Applies on top of 20260925040000_birmingham_addresses.sql. Idempotent where practical.
--
-- The homeowner Services tab grows from six add-on tiles into three service
-- lines plus an open-ended photo request:
--
--   Maintenance, Seasonal  network partners bid (request_quote + fanout-quote), PHP keeps 10%
--   Contracted             PHP under its GC license: assessment -> estimate (a range) ->
--                          client approves -> in progress -> done
--   Show us                a photo request the office routes to the next visit, partner
--                          quotes, a contracted project, or a reply
--
--   1. service_categories gains line, handled_by, season_months and sort. The
--      26-row catalog lives in private.service_catalog(), so this migration and
--      seed_demo upsert exactly the same rows. Existing ids keep their meaning.
--   2. service_requests and service_request_photos, plus visit_tasks.request_id
--      (the "Client request" checklist row a tech ticks like any other task).
--   3. RLS: both tables are readable by the home's owner, the office, and a tech
--      whose visit has a task linked to the request. Vendors never see them.
--      There are no client write policies and no client write privileges: every
--      write goes through the RPCs in section 8.
--   4. Storage: a private bucket request-photos, paths {request_id}/{uuid}.jpg.
--      The request's homeowner uploads; the homeowner, the office and a linked
--      tech read (so each can create signed URLs).
--   5. Realtime: service_requests and service_request_photos join
--      supabase_realtime (visit_tasks already is).
--   6. request_quote refuses php (contracted) categories with "Request an
--      assessment for this service instead." Its find-or-create body moves to
--      private.open_quote_request(), which office_route_request's "quotes" route
--      shares, so both create quote requests the same way.
--   7. set_plan_tier keeps client-request tasks when it swaps the current
--      visit's checklist (it used to delete every task on the visit).
--   8. RPCs (security definer, search_path = public, authenticated only; errors
--      are user-facing, errcode P0001):
--        create_service_request      homeowner with a home            -> uuid
--        add_service_request_photo   the requester, at most 4         -> service_request_photos
--        office_route_request        office; new/reviewing requests   -> jsonb
--        office_update_project       office; project status machine   -> service_requests
--        approve_estimate            the owner; estimate_sent only    -> service_requests
--        cancel_service_request      the owner; before approval       -> service_requests
--   9. seed_demo: 20260925040000_birmingham_addresses.sql's definition with the
--      catalog, vendor categories, clearing requests and three seeded requests
--      changed; the advisory lock and everything else are unchanged.
--
-- Deviations from docs/SERVICES_V2.md, on purpose:
--   * "Next visit" (office_route_request 'visit') is the home's earliest visit
--     that isn't done or canceled and ends today (Chicago) or later, not "ends
--     after now". The seeded route is today at fixed times (Elena 9-11 AM), so
--     the literal rule would refuse "Add to next visit" for Elena every
--     afternoon of a live demo, although Marcus hasn't been there yet.
--   * The RPCs the spec gives no return type return the row they changed (as
--     book_bid and reschedule_visit do); clients may ignore it.
--   * create_service_request returns the existing request for an identical
--     double tap (same home, kind, category and description, still new, within
--     a minute), like save_home and request_quote are double-tap safe.
--   * office_update_project also lets the office reschedule an assessment
--     (assessment_scheduled -> assessment_scheduled) and revise an estimate
--     (estimate_sent -> estimate_sent).
--
-- Advisors: NOT yet run against the hosted project (this file has not been
-- applied there). Expected after applying, per the lints the earlier files
-- recorded:
--   * Security, lint 0029 "authenticated can execute SECURITY DEFINER
--     function": the six new RPCs join the accepted pattern. Each checks the
--     caller's role and ownership itself; anon can execute none of them.
--     request_quote and set_plan_tier are replaced with unchanged grants.
--   * Performance, lint 0006 "multiple permissive policies": service_requests
--     and service_request_photos (owner_* / tech_* / office_*, one policy per
--     audience, as elsewhere), and possibly storage.objects (visit-photos and
--     request-photos each have their own SELECT policy).
--   * No unindexed_foreign_keys (every new foreign key has an index),
--     function_search_path_mutable (every function pins search_path),
--     auth_rls_initplan (helpers are wrapped in (select ...)) or rls_disabled.
-- Run get_advisors (security and performance) after applying and record the
-- result here, as 20260925000000_live.sql does.

-- ---------------------------------------------------------------------------
-- 1. Catalog: service lines
-- ---------------------------------------------------------------------------

alter table public.service_categories
  add column if not exists line text not null default 'maintenance',
  add column if not exists handled_by text not null default 'network',
  add column if not exists season_months smallint[],
  add column if not exists sort smallint not null default 0;

alter table public.service_categories drop constraint if exists service_categories_line_check;
alter table public.service_categories
  add constraint service_categories_line_check check (line in ('maintenance', 'seasonal', 'contracted'));
alter table public.service_categories drop constraint if exists service_categories_handled_by_check;
alter table public.service_categories
  add constraint service_categories_handled_by_check check (handled_by in ('network', 'php'));
-- PHP does contracted work itself; maintenance and seasonal go to the network.
alter table public.service_categories drop constraint if exists service_categories_line_handler_check;
alter table public.service_categories
  add constraint service_categories_line_handler_check check ((line = 'contracted') = (handled_by = 'php'));
alter table public.service_categories drop constraint if exists service_categories_season_months_check;
alter table public.service_categories
  add constraint service_categories_season_months_check check (
    season_months is null
    or (cardinality(season_months) between 1 and 12
        and season_months <@ '{1,2,3,4,5,6,7,8,9,10,11,12}'::smallint[]));

-- The full catalog (docs/SERVICES_V2.md "Catalog"), in display order. sort is
-- global with gaps of 10, so it also orders each line. season_months is the
-- Birmingham calendar; null means year-round. Contracted services have no base
-- price: they are estimated per project.
create or replace function private.service_catalog()
  returns table (id text, line text, handled_by text, name text, sub text, base numeric, season_months smallint[], sort smallint)
  language sql immutable set search_path = public
  as $$
  select c.id, c.line, c.handled_by, c.name, c.sub, c.base::numeric, c.season_months::smallint[], c.sort::smallint
  from (values
    ('lawn',          'maintenance', 'network', 'Lawn care',                 'Weekly mow, edge and blow',            65,          null,                  10),
    ('land',          'maintenance', 'network', 'Landscaping',               'Beds, mulch, seasonal color',          1400,        null,                  20),
    ('win',           'maintenance', 'network', 'Window washing',            'Inside and out, screens',              420,         null,                  30),
    ('press',         'maintenance', 'network', 'Pressure washing',          'Driveway, walks, siding',              340,         null,                  40),
    ('gutter',        'maintenance', 'network', 'Gutter cleaning',           'Clean, flush, check downspouts',       225,         null,                  50),
    ('pest',          'maintenance', 'network', 'Pest control',              'Quarterly, inside and out',            120,         null,                  60),
    ('carpet',        'maintenance', 'network', 'Carpet & upholstery',       'Deep clean, spot treatment',           280,         null,                  70),
    ('tree',          'maintenance', 'network', 'Tree service',              'Trim, removal, stump grind',           780,         null,                  80),
    ('lights',        'seasonal',    'network', 'Holiday lights',            'Roofline install and removal',         1150,        '{10,11,12}',          90),
    ('leaves',        'seasonal',    'network', 'Leaf removal',              'Beds, lawn and gutters',               260,         '{10,11,12}',         100),
    ('hvac_tune',     'seasonal',    'network', 'HVAC tune-up',              'Spring cooling / fall heating check',  160,         '{3,4,9,10}',         110),
    ('winterize',     'seasonal',    'network', 'Winterize',                 'Irrigation blow-out, hose bibs',       150,         '{10,11}',            120),
    ('chimney',       'seasonal',    'network', 'Chimney sweep',             'Sweep and safety inspection',          240,         '{9,10,11}',          130),
    ('pool_open',     'seasonal',    'network', 'Pool opening',              'Uncover, balance, start up',           325,         '{3,4,5}',            140),
    ('pool_close',    'seasonal',    'network', 'Pool closing',              'Winterize and cover',                  325,         '{9,10}',             150),
    ('storm',         'seasonal',    'network', 'Storm prep',                'Generator service, tie-downs',         210,         '{3,4,5,6}',          160),
    ('roof',          'contracted',  'php',     'Roofing',                   'Inspections, repairs, replacement',    null,        null,                 170),
    ('pool',          'contracted',  'php',     'Pools',                     'Repair, resurfacing, equipment',       null,        null,                 180),
    ('kitchen_bath',  'contracted',  'php',     'Kitchen & bath refresh',    'Updates without a full gut',           null,        null,                 190),
    ('cabinets',      'contracted',  'php',     'Cabinet refinishing',       'Paint, reface, new hardware',          null,        null,                 200),
    ('floors',        'contracted',  'php',     'Flooring',                  'Refinish, repair, replace',            null,        null,                 210),
    ('paint',         'contracted',  'php',     'Painting',                  'Interior and exterior',                null,        null,                 220),
    ('outdoor',       'contracted',  'php',     'Decks, patios & fences',    'Build, repair, restain',               null,        null,                 230),
    ('doors_windows', 'contracted',  'php',     'Doors & windows',           'Repair and replacement',               null,        null,                 240),
    ('carpentry',     'contracted',  'php',     'Drywall, trim & carpentry', 'Patches, built-ins, trim',             null,        null,                 250),
    ('project',       'contracted',  'php',     'Something bigger',          'Remodels, additions, anything else',   null,        null,                 260)
  ) as c(id, line, handled_by, name, sub, base, season_months, sort)
$$;

insert into public.service_categories (id, line, handled_by, name, sub, base, season_months, sort)
select c.id, c.line, c.handled_by, c.name, c.sub, c.base, c.season_months, c.sort from private.service_catalog() c
on conflict (id) do update
set line = excluded.line, handled_by = excluded.handled_by, name = excluded.name, sub = excluded.sub,
    base = excluded.base, season_months = excluded.season_months, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- 2. Requests: service_requests, service_request_photos, visit_tasks.request_id
-- ---------------------------------------------------------------------------

-- One row per "Show us" photo request or contracted project. Status by route:
--   photo    new/reviewing -> scheduled (visit) | quoted (quotes) | closed (advice)
--            | reviewing as a project (project) | canceled
--   project  new/reviewing -> assessment_scheduled -> estimate_sent -> approved
--            -> in_progress -> done; declined (office) or canceled (owner) while open
create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  home_id uuid not null references public.homes on delete cascade,
  requester_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('photo', 'project')),
  category text references public.service_categories,
  title text not null check (char_length(title) between 1 and 80),
  description text not null check (char_length(description) between 1 and 1000),
  room text check (room in ('kitchen', 'bath', 'bedroom', 'living', 'exterior', 'garage', 'other')),
  urgency text not null default 'whenever' check (urgency in ('whenever', 'soon', 'urgent')),
  status text not null default 'new' check (status in (
    'new', 'reviewing', 'assessment_scheduled', 'estimate_sent', 'approved', 'in_progress', 'done',
    'scheduled', 'quoted', 'closed', 'declined', 'canceled')),
  route text check (route in ('visit', 'quotes', 'project', 'advice')),
  visit_id uuid references public.visits on delete set null,
  quote_request_id uuid references public.quote_requests on delete set null,
  assessment_at timestamptz,
  estimate_low numeric(10, 2) check (estimate_low > 0),
  estimate_high numeric(10, 2) check (estimate_high > 0),
  -- Visible to the client (and a linked tech): the office's reply or note.
  office_note text check (char_length(office_note) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A project always has its (contracted) category; a photo may have none until routed.
  constraint service_requests_project_category_check check (kind = 'photo' or category is not null),
  constraint service_requests_estimate_range_check check (estimate_low is null or estimate_high is null or estimate_low <= estimate_high)
);

create index if not exists service_requests_home_id_idx on public.service_requests (home_id);
create index if not exists service_requests_requester_id_idx on public.service_requests (requester_id);
create index if not exists service_requests_category_idx on public.service_requests (category);
create index if not exists service_requests_visit_id_idx on public.service_requests (visit_id);
create index if not exists service_requests_quote_request_id_idx on public.service_requests (quote_request_id);

drop trigger if exists service_requests_touch on public.service_requests;
create trigger service_requests_touch before update on public.service_requests
  for each row execute function private.touch_updated_at();

-- Storage paths in request-photos, recorded by add_service_request_photo.
create table if not exists public.service_request_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests on delete cascade,
  path text not null,
  created_at timestamptz not null default now(),
  unique (request_id, path)
);

-- The checklist row office_route_request adds to a visit ("Client request: ...").
alter table public.visit_tasks
  add column if not exists request_id uuid references public.service_requests on delete set null;
-- One task per request; also the foreign key's index (NULLs don't collide).
create unique index if not exists visit_tasks_request_id_key on public.visit_tasks (request_id);

-- ---------------------------------------------------------------------------
-- 3. Row-level security: owner, office, linked tech read; RPCs write
-- ---------------------------------------------------------------------------

-- Service requests on the caller's homes.
create or replace function private.owned_service_request_ids() returns setof uuid
  language sql stable security definer set search_path = public
  as $$ select r.id from service_requests r join homes h on h.id = r.home_id where h.owner_id = auth.uid() $$;

-- Service requests linked to a checklist task on the caller's (tech) visits.
create or replace function private.tech_request_ids() returns setof uuid
  language sql stable security definer set search_path = public
  as $$
  select distinct t.request_id from visit_tasks t join visits v on v.id = t.visit_id
  where v.tech_id = auth.uid() and t.request_id is not null
$$;

alter table public.service_requests enable row level security;
alter table public.service_request_photos enable row level security;

drop policy if exists owner_service_requests on public.service_requests;
drop policy if exists tech_service_requests on public.service_requests;
drop policy if exists office_service_requests on public.service_requests;
create policy owner_service_requests on public.service_requests for select to authenticated
  using (home_id in (select private.owned_home_ids()));
create policy tech_service_requests on public.service_requests for select to authenticated
  using (id in (select private.tech_request_ids()));
create policy office_service_requests on public.service_requests for select to authenticated
  using ((select private.my_role()) = 'office');

drop policy if exists owner_request_photos on public.service_request_photos;
drop policy if exists tech_request_photos on public.service_request_photos;
drop policy if exists office_request_photos on public.service_request_photos;
create policy owner_request_photos on public.service_request_photos for select to authenticated
  using (request_id in (select private.owned_service_request_ids()));
create policy tech_request_photos on public.service_request_photos for select to authenticated
  using (request_id in (select private.tech_request_ids()));
create policy office_request_photos on public.service_request_photos for select to authenticated
  using ((select private.my_role()) = 'office');

-- RLS already refuses client writes (no write policies); TRUNCATE bypasses RLS,
-- so take the write privileges away as well (as for quote_bookings).
revoke insert, update, delete, truncate on public.service_requests, public.service_request_photos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Storage: request-photos/{request_id}/{uuid}.jpg
-- ---------------------------------------------------------------------------

-- The app re-encodes captures as JPEG (long edge 1600 px), so 10 MB and three
-- image types leave plenty of room while keeping the bucket for photos only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-photos', 'request-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Upload: the owner of the request's home. First path segment is the request id.
create or replace function private.can_upload_request_photo(p_folder text) returns boolean
  language sql stable security definer set search_path = public
  as $$
  select exists (
    select 1 from service_requests r join homes h on h.id = r.home_id
    where r.id::text = p_folder and h.owner_id = auth.uid()
  )
$$;

-- Read (and so sign URLs): the home's owner, the office, and a tech whose visit
-- has a task linked to the request.
create or replace function private.can_read_request_photo(p_folder text) returns boolean
  language sql stable security definer set search_path = public
  as $$
  select exists (
    select 1 from service_requests r join homes h on h.id = r.home_id
    where r.id::text = p_folder and h.owner_id = auth.uid()
  ) or exists (
    select 1 from visit_tasks t join visits v on v.id = t.visit_id
    where t.request_id::text = p_folder and v.tech_id = auth.uid()
  ) or coalesce((select role = 'office' from profiles where id = auth.uid()), false)
$$;

drop policy if exists request_photos_owner_insert on storage.objects;
create policy request_photos_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'request-photos'
              and array_length(storage.foldername(name), 1) = 1
              and private.can_upload_request_photo((storage.foldername(name))[1]));

drop policy if exists request_photos_read on storage.objects;
create policy request_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'request-photos' and private.can_read_request_photo((storage.foldername(name))[1]));

-- ---------------------------------------------------------------------------
-- 5. Realtime publication
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['service_requests', 'service_request_photos'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Quotes: shared find-or-create, and request_quote refuses php categories
-- ---------------------------------------------------------------------------

-- The home's active (open or booked) request for a category, or a new open
-- one. The body of request_quote from 20260925000000_live.sql, unchanged.
create or replace function private.open_quote_request(p_home uuid, p_category text) returns quote_requests
  language plpgsql security definer set search_path = public
  as $$
declare
  v_home homes;
  v_cat service_categories;
  v_req quote_requests;
begin
  select * into v_home from homes where id = p_home;
  select * into v_cat from service_categories where id = p_category;
  if v_home.id is null or v_cat.id is null then
    raise exception 'That service isn''t available yet.' using errcode = 'P0001';
  end if;
  select * into v_req from quote_requests
  where home_id = v_home.id and category = v_cat.id and status in ('open', 'booked')
  order by created_at desc limit 1;
  if found then
    return v_req;
  end if;
  insert into quote_requests (home_id, category, scope, status, base, area, home_sqft)
  values (v_home.id, v_cat.id, v_cat.sub, 'open', v_cat.base, private.home_area(v_home.address), v_home.sqft)
  on conflict (home_id, category) where status in ('open', 'booked') do nothing
  returning * into v_req;
  if not found then
    select * into v_req from quote_requests
    where home_id = v_home.id and category = v_cat.id and status in ('open', 'booked')
    order by created_at desc limit 1;
  end if;
  return v_req;
end $$;

-- Homeowner asks for bids on a network service. Idempotent per home and category.
create or replace function public.request_quote(p_category text) returns quote_requests
  language plpgsql security definer set search_path = public
  as $$
declare
  v_home homes;
  v_cat service_categories;
begin
  perform private.require_role('homeowner');
  select * into v_home from homes where owner_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception 'Add your home before requesting quotes.' using errcode = 'P0001';
  end if;
  select * into v_cat from service_categories where id = p_category;
  if not found then
    raise exception 'That service isn''t available yet.' using errcode = 'P0001';
  end if;
  -- Services v2: PHP does contracted work itself, after an assessment; partners never bid on it.
  if v_cat.handled_by <> 'network' then
    raise exception 'Request an assessment for this service instead.' using errcode = 'P0001';
  end if;
  return private.open_quote_request(v_home.id, v_cat.id);
end $$;

-- ---------------------------------------------------------------------------
-- 7. set_plan_tier: keep client-request tasks
-- ---------------------------------------------------------------------------

-- Owner switches tier. The current visit's checklist follows when nothing has started.
-- Prices are stored as sent: nothing reads plans.monthly/annual for money yet.
-- Billing must compute prices server-side (packages/pricing + pricing_settings), never trust these.
-- 20260925020000_review_fixes.sql's definition; only the marked delete changed.
create or replace function public.set_plan_tier(
  p_tier tier_key, p_monthly numeric, p_annual numeric, p_materials numeric, p_labor numeric, p_next_tasks text[]
) returns plans
  language plpgsql security definer set search_path = public
  as $$
declare
  v_plan plans;
  v_visit visits;
  v_keys text[];
begin
  perform private.require_role('homeowner');
  if p_tier is null then
    raise exception 'Pick a plan tier.' using errcode = 'P0001';
  end if;
  if p_monthly is null or p_annual is null or p_materials is null or p_labor is null
     or p_monthly < 0 or p_annual < 0 or p_materials < 0 or p_labor < 0 then
    raise exception 'Something''s off with that price. Try again.' using errcode = 'P0001';
  end if;
  select pl.* into v_plan from plans pl join homes h on h.id = pl.home_id
  where h.owner_id = auth.uid() and pl.active
  order by pl.starts_on desc nulls last, pl.id
  limit 1
  for update of pl;
  if not found then
    raise exception 'Start a plan first.' using errcode = 'P0001';
  end if;
  update plans
  set tier = p_tier, monthly = round(p_monthly, 2), annual = round(p_annual, 2),
      materials = round(p_materials, 2), labor = round(p_labor, 2)
  where id = v_plan.id
  returning * into v_plan;

  -- Review fix 2: only real task keys, first occurrence wins, at most 7.
  v_keys := array(
    select k.key from (
      select td.task_key as key, min(u.ord) as ord
      from unnest(coalesce(p_next_tasks, '{}'::text[])) with ordinality u(key, ord)
      join task_defaults td on td.task_key = u.key
      group by td.task_key
    ) k
    order by k.ord
    limit 7
  );

  select * into v_visit from visits where id = private.current_visit_id(v_plan.home_id) for update;
  if found
     and v_visit.status in ('scheduled', 'confirmed')
     and cardinality(v_keys) > 0
     and not exists (select 1 from visit_tasks where visit_id = v_visit.id and done) then
    -- Services v2: plan tasks are swapped; a client request the office added stays on the visit.
    delete from visit_tasks where visit_id = v_visit.id and request_id is null;
    insert into visit_tasks (visit_id, task_key, name, part_id, appliance_id)
    select v_visit.id, td.task_key, coalesce(td.name, td.task_key), private.task_part_id(td.task_key),
           private.home_appliance_for(v_visit.home_id, td.task_key)
    from unnest(v_keys) with ordinality k(key, ord)
    join task_defaults td on td.task_key = k.key
    order by k.ord;
  end if;
  return v_plan;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Service request RPCs
-- ---------------------------------------------------------------------------

-- A title from free text: whitespace collapsed, at most 80 characters, cut at
-- a word with an ellipsis when longer.
create or replace function private.short_title(p_text text) returns text
  language sql immutable set search_path = public
  as $$
  with t as (select btrim(regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g')) as s)
  select case
    when char_length(s) <= 80 then nullif(s, '')
    else coalesce(nullif(regexp_replace(left(s, 79), '\s+\S*$', ''), ''), left(s, 79)) || '…'
  end
  from t
$$;

-- Homeowner sends a "Show us" photo request or asks for a contracted-project
-- assessment. Returns the new request's id; photos are added afterwards with
-- add_service_request_photo. Every parameter defaults to null so callers may
-- leave out the optional ones.
create or replace function public.create_service_request(
  p_kind text default null, p_category text default null, p_title text default null,
  p_description text default null, p_room text default null, p_urgency text default null
) returns uuid
  language plpgsql security definer set search_path = public
  as $$
declare
  v_home homes;
  v_cat service_categories;
  v_kind text := btrim(coalesce(p_kind, ''));
  v_cat_id text := nullif(btrim(coalesce(p_category, '')), '');
  v_desc text := btrim(coalesce(p_description, ''));
  v_title text := btrim(regexp_replace(coalesce(p_title, ''), '\s+', ' ', 'g'));
  v_room text := nullif(btrim(coalesce(p_room, '')), '');
  v_urgency text := coalesce(nullif(btrim(coalesce(p_urgency, '')), ''), 'whenever');
  v_id uuid;
begin
  perform private.require_role('homeowner');
  -- A demo reset (seed_demo, exclusive) never interleaves with a new request.
  perform pg_advisory_xact_lock_shared(hashtextextended('php:demo-data', 0));
  select * into v_home from homes where owner_id = auth.uid() order by created_at, id limit 1;
  if not found then
    raise exception 'Add your home before sending a request.' using errcode = 'P0001';
  end if;
  if v_kind not in ('photo', 'project') then
    raise exception 'That request type isn''t supported.' using errcode = 'P0001';
  end if;
  if v_cat_id is not null then
    select * into v_cat from service_categories where id = v_cat_id;
    if not found then
      raise exception 'That service isn''t available yet.' using errcode = 'P0001';
    end if;
  end if;
  if v_kind = 'project' then
    if v_cat.id is null then
      raise exception 'Pick a service for this project.' using errcode = 'P0001';
    end if;
    if v_cat.handled_by <> 'php' then
      raise exception 'Get quotes for this service instead.' using errcode = 'P0001';
    end if;
  end if;
  if v_desc = '' then
    raise exception 'Tell us what''s going on.' using errcode = 'P0001';
  end if;
  if char_length(v_desc) > 1000 then
    raise exception 'Keep the description to 1,000 characters or fewer.' using errcode = 'P0001';
  end if;
  if char_length(v_title) > 80 then
    raise exception 'Use a title of 80 characters or fewer.' using errcode = 'P0001';
  end if;
  if v_title = '' then
    v_title := coalesce(v_cat.name, private.short_title(v_desc));
  end if;
  if v_room is not null and v_room not in ('kitchen', 'bath', 'bedroom', 'living', 'exterior', 'garage', 'other') then
    raise exception 'Pick where in the home.' using errcode = 'P0001';
  end if;
  if v_urgency not in ('whenever', 'soon', 'urgent') then
    raise exception 'Pick how soon you need this.' using errcode = 'P0001';
  end if;

  -- A double tap returns the request the first tap created.
  perform pg_advisory_xact_lock(hashtextextended('service_request:' || auth.uid()::text, 0));
  select id into v_id from service_requests
  where home_id = v_home.id and requester_id = auth.uid() and kind = v_kind
    and category is not distinct from v_cat.id and description = v_desc
    and status = 'new' and created_at > now() - interval '1 minute'
  order by created_at desc
  limit 1;
  if found then
    return v_id;
  end if;

  insert into service_requests (home_id, requester_id, kind, category, title, description, room, urgency, status)
  values (v_home.id, auth.uid(), v_kind, v_cat.id, v_title, v_desc, v_room, v_urgency, 'new')
  returning id into v_id;
  return v_id;
end $$;

-- The requester records a photo uploaded to request-photos/{request_id}/<file>.
-- Same path twice returns the existing row. At most 4 photos per request.
create or replace function public.add_service_request_photo(p_request_id uuid, p_path text) returns service_request_photos
  language plpgsql security definer set search_path = public
  as $$
declare
  v_req service_requests;
  v_photo service_request_photos;
  v_count int;
begin
  perform private.require_role('homeowner');
  perform pg_advisory_xact_lock_shared(hashtextextended('php:demo-data', 0));
  select * into v_req from service_requests where id = p_request_id and requester_id = auth.uid() for update;
  if not found then
    raise exception 'We couldn''t find that request.' using errcode = 'P0001';
  end if;
  -- One file directly under the request's folder, with a plain file name.
  if p_path is null or p_path !~ ('^' || v_req.id::text || '/[A-Za-z0-9._-]{1,100}$') then
    raise exception 'That photo doesn''t belong to this request.' using errcode = 'P0001';
  end if;
  select * into v_photo from service_request_photos where request_id = v_req.id and path = p_path;
  if found then
    return v_photo;
  end if;
  select count(*) into v_count from service_request_photos where request_id = v_req.id;
  if v_count >= 4 then
    raise exception 'You can add up to 4 photos.' using errcode = 'P0001';
  end if;
  insert into service_request_photos (request_id, path) values (v_req.id, p_path) returning * into v_photo;
  return v_photo;
end $$;

-- Office triages a new or reviewing request:
--   visit    a "Client request: <title>" task on the home's next visit -> scheduled
--   quotes   a quote_request for a network category (as request_quote) -> quoted;
--            the office client then invokes fanout-quote with quote_request_id
--   project  a contracted category; the request becomes a project -> reviewing
--   advice   the note is the reply -> closed
-- A category given here is validated and stored; otherwise the request's own is used.
-- Returns {request_id, route, status, kind, category, visit_id, visit_task_id, quote_request_id}.
create or replace function public.office_route_request(
  p_request_id uuid, p_route text, p_category text default null, p_note text default null
) returns jsonb
  language plpgsql security definer set search_path = public
  as $$
declare
  v_req service_requests;
  v_cat service_categories;
  v_route text := btrim(coalesce(p_route, ''));
  v_cat_id text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_visit visits;
  v_task_id uuid;
  v_quote quote_requests;
begin
  perform private.require_role('office');
  perform pg_advisory_xact_lock_shared(hashtextextended('php:demo-data', 0));
  select * into v_req from service_requests where id = p_request_id for update;
  if not found then
    raise exception 'We couldn''t find that request.' using errcode = 'P0001';
  end if;
  if v_req.status not in ('new', 'reviewing') then
    raise exception '%', case v_req.status
        when 'canceled' then 'The client canceled this request.'
        else 'This request was already handled.'
      end
      using errcode = 'P0001';
  end if;
  if v_route not in ('visit', 'quotes', 'project', 'advice') then
    raise exception 'Pick how to handle this request.' using errcode = 'P0001';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Keep the note to 1,000 characters or fewer.' using errcode = 'P0001';
  end if;
  v_cat_id := coalesce(nullif(btrim(coalesce(p_category, '')), ''), v_req.category);
  if v_cat_id is not null then
    select * into v_cat from service_categories where id = v_cat_id;
    if not found then
      raise exception 'That service isn''t available yet.' using errcode = 'P0001';
    end if;
  end if;

  if v_route = 'visit' then
    -- The earliest visit that isn't done or canceled and ends today (Chicago) or later.
    -- Today's visit counts even after its window: the tech hasn't finished there yet.
    select * into v_visit from visits
    where home_id = v_req.home_id
      and status not in ('done', 'canceled')
      and window_end >= private.chicago_at(private.chicago_today(), time '00:00')
    order by window_start, id
    limit 1
    for update;
    if not found then
      raise exception 'There''s no visit scheduled for this home.' using errcode = 'P0001';
    end if;
    insert into visit_tasks (visit_id, task_key, name, request_id)
    values (v_visit.id, 'request', 'Client request: ' || v_req.title, v_req.id)
    returning id into v_task_id;
    update service_requests
    set status = 'scheduled', route = 'visit', visit_id = v_visit.id, category = v_cat.id,
        office_note = coalesce(v_note, office_note)
    where id = v_req.id
    returning * into v_req;

  elsif v_route = 'quotes' then
    if v_cat.id is null or v_cat.handled_by <> 'network' then
      raise exception 'Pick a partner service for quotes.' using errcode = 'P0001';
    end if;
    v_quote := private.open_quote_request(v_req.home_id, v_cat.id);
    update service_requests
    set status = 'quoted', route = 'quotes', quote_request_id = v_quote.id, category = v_cat.id,
        office_note = coalesce(v_note, office_note)
    where id = v_req.id
    returning * into v_req;

  elsif v_route = 'project' then
    if v_cat.id is null or v_cat.handled_by <> 'php' then
      raise exception 'Pick a Premium Home service for the project.' using errcode = 'P0001';
    end if;
    update service_requests
    set kind = 'project', status = 'reviewing', route = 'project', category = v_cat.id,
        office_note = coalesce(v_note, office_note)
    where id = v_req.id
    returning * into v_req;

  else -- advice
    if v_note is null then
      raise exception 'Add a reply for the client.' using errcode = 'P0001';
    end if;
    update service_requests
    set status = 'closed', route = 'advice', category = v_cat.id, office_note = v_note
    where id = v_req.id
    returning * into v_req;
  end if;

  return jsonb_build_object(
    'request_id', v_req.id, 'route', v_req.route, 'status', v_req.status, 'kind', v_req.kind,
    'category', v_req.category, 'visit_id', v_req.visit_id, 'visit_task_id', v_task_id,
    'quote_request_id', v_req.quote_request_id);
end $$;

-- Office moves a project along:
--   new | reviewing | assessment_scheduled   -> assessment_scheduled  (p_assessment_at)
--   ... | assessment_scheduled | estimate_sent -> estimate_sent       (0 < low <= high)
--   approved -> in_progress -> done
--   any open status -> declined                                        (p_note)
-- approved is the client's step (approve_estimate). A note, when given, is stored.
create or replace function public.office_update_project(
  p_request_id uuid, p_status text, p_assessment_at timestamptz default null,
  p_estimate_low numeric default null, p_estimate_high numeric default null, p_note text default null
) returns service_requests
  language plpgsql security definer set search_path = public
  as $$
declare
  v_req service_requests;
  v_status text := btrim(coalesce(p_status, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_role('office');
  select * into v_req from service_requests where id = p_request_id for update;
  if not found then
    raise exception 'We couldn''t find that request.' using errcode = 'P0001';
  end if;
  if v_req.kind <> 'project' then
    raise exception 'This request isn''t a project.' using errcode = 'P0001';
  end if;
  if v_status not in ('assessment_scheduled', 'estimate_sent', 'approved', 'in_progress', 'done', 'declined') then
    raise exception 'That project status isn''t supported.' using errcode = 'P0001';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'Keep the note to 1,000 characters or fewer.' using errcode = 'P0001';
  end if;
  if v_req.status in ('done', 'declined', 'canceled', 'closed') then
    -- The same final step twice (a double tap) is a no-op.
    if v_req.status = v_status then
      return v_req;
    end if;
    raise exception '%', case v_req.status
        when 'done' then 'This project is already done.'
        when 'declined' then 'This project was declined.'
        when 'canceled' then 'The client canceled this request.'
        else 'This request is closed.'
      end
      using errcode = 'P0001';
  end if;

  if v_status = 'approved' then
    raise exception 'Only the client can approve the estimate.' using errcode = 'P0001';

  elsif v_status = 'assessment_scheduled' then
    if v_req.status not in ('new', 'reviewing', 'assessment_scheduled') then
      raise exception 'This project is past that step.' using errcode = 'P0001';
    end if;
    if p_assessment_at is null then
      raise exception 'Pick a date and time for the assessment.' using errcode = 'P0001';
    end if;
    update service_requests
    set status = 'assessment_scheduled', assessment_at = p_assessment_at, office_note = coalesce(v_note, office_note)
    where id = v_req.id
    returning * into v_req;

  elsif v_status = 'estimate_sent' then
    if v_req.status not in ('new', 'reviewing', 'assessment_scheduled', 'estimate_sent') then
      raise exception 'This project is past that step.' using errcode = 'P0001';
    end if;
    if p_estimate_low is null or p_estimate_high is null then
      raise exception 'Enter the low and high estimate.' using errcode = 'P0001';
    end if;
    if p_estimate_low <= 0 or p_estimate_high <= 0 then
      raise exception 'Enter an estimate above $0.' using errcode = 'P0001';
    end if;
    if p_estimate_low > p_estimate_high then
      raise exception 'The low estimate can''t be more than the high one.' using errcode = 'P0001';
    end if;
    if p_estimate_high >= 10000000 then
      raise exception 'Enter an estimate under $10,000,000.' using errcode = 'P0001';
    end if;
    update service_requests
    set status = 'estimate_sent', estimate_low = round(p_estimate_low, 2), estimate_high = round(p_estimate_high, 2),
        office_note = coalesce(v_note, office_note)
    where id = v_req.id
    returning * into v_req;

  elsif v_status = 'in_progress' then
    if v_req.status = 'in_progress' then
      return v_req;
    end if;
    if v_req.status <> 'approved' then
      raise exception 'Start work once the client approves the estimate.' using errcode = 'P0001';
    end if;
    update service_requests set status = 'in_progress', office_note = coalesce(v_note, office_note)
    where id = v_req.id
    returning * into v_req;

  elsif v_status = 'done' then
    if v_req.status <> 'in_progress' then
      raise exception 'Start work before marking the project done.' using errcode = 'P0001';
    end if;
    update service_requests set status = 'done', office_note = coalesce(v_note, office_note)
    where id = v_req.id
    returning * into v_req;

  else -- declined
    if v_note is null then
      raise exception 'Add a note for the client.' using errcode = 'P0001';
    end if;
    update service_requests set status = 'declined', office_note = v_note
    where id = v_req.id
    returning * into v_req;
  end if;
  return v_req;
end $$;

-- The home's owner approves the estimate range. Approving twice is a no-op.
create or replace function public.approve_estimate(p_request_id uuid) returns service_requests
  language plpgsql security definer set search_path = public
  as $$
declare v_req service_requests;
begin
  perform private.require_role('homeowner');
  select * into v_req from service_requests
  where id = p_request_id and home_id in (select id from homes where owner_id = auth.uid())
  for update;
  if not found then
    raise exception 'We couldn''t find that request.' using errcode = 'P0001';
  end if;
  if v_req.status = 'approved' then
    return v_req;
  end if;
  if v_req.status <> 'estimate_sent' then
    raise exception 'There''s no estimate waiting for your approval.' using errcode = 'P0001';
  end if;
  update service_requests set status = 'approved' where id = v_req.id returning * into v_req;
  return v_req;
end $$;

-- The home's owner withdraws a request before it is routed or approved
-- (new, reviewing, assessment_scheduled, estimate_sent). Canceling twice is a no-op.
create or replace function public.cancel_service_request(p_request_id uuid) returns service_requests
  language plpgsql security definer set search_path = public
  as $$
declare v_req service_requests;
begin
  perform private.require_role('homeowner');
  select * into v_req from service_requests
  where id = p_request_id and home_id in (select id from homes where owner_id = auth.uid())
  for update;
  if not found then
    raise exception 'We couldn''t find that request.' using errcode = 'P0001';
  end if;
  if v_req.status = 'canceled' then
    return v_req;
  end if;
  if v_req.status not in ('new', 'reviewing', 'assessment_scheduled', 'estimate_sent') then
    raise exception 'This request can''t be canceled now.' using errcode = 'P0001';
  end if;
  update service_requests set status = 'canceled' where id = v_req.id returning * into v_req;
  return v_req;
end $$;

-- ---------------------------------------------------------------------------
-- 9. seed_demo: the full catalog and the Services v2 scenario
-- ---------------------------------------------------------------------------

-- Rebuilds the demo scenario relative to p_today (Chicago). Never deletes auth users.
-- 20260925040000_birmingham_addresses.sql's definition; changes are marked "Services v2".
create or replace function public.seed_demo(p_today date default (now() at time zone 'America/Chicago')::date) returns void
  language plpgsql security definer set search_path = public
  as $$
declare
  d date := coalesce(p_today, private.chicago_today());
  -- Services v2: every catalog id, and the network ones every vendor serves.
  all_cats constant text[] := array(select c.id from private.service_catalog() c order by c.sort);
  net_cats constant text[] := array(select c.id from private.service_catalog() c where c.handled_by = 'network' order by c.sort);
  all_tasks constant text[] := array['hvac', 'fridge', 'ice', 'dish', 'wh', 'dryer', 'smoke'];
  u_marcus constant uuid := 'a0000000-0000-4000-8000-000000000002';
  u_dana   constant uuid := 'a0000000-0000-4000-8000-000000000003';
  u_sam    constant uuid := 'a0000000-0000-4000-8000-000000000004';
  u_elena  constant uuid := 'a0000000-0000-4000-8000-000000000005';
  u_david  constant uuid := 'a0000000-0000-4000-8000-000000000007';
  u_whit   constant uuid := 'a0000000-0000-4000-8000-000000000008';
  u_priya  constant uuid := 'a0000000-0000-4000-8000-000000000009';
  u_bell   constant uuid := 'a0000000-0000-4000-8000-000000000010';
  h_elena  constant uuid := 'b0000000-0000-4000-8000-000000000005';
  h_david  constant uuid := 'b0000000-0000-4000-8000-000000000007';
  h_whit   constant uuid := 'b0000000-0000-4000-8000-000000000008';
  h_priya  constant uuid := 'b0000000-0000-4000-8000-000000000009';
  h_bell   constant uuid := 'b0000000-0000-4000-8000-000000000010';
  p_elena  constant uuid := 'c0000000-0000-4000-8000-000000000005';
  p_david  constant uuid := 'c0000000-0000-4000-8000-000000000007';
  p_whit   constant uuid := 'c0000000-0000-4000-8000-000000000008';
  p_priya  constant uuid := 'c0000000-0000-4000-8000-000000000009';
  p_bell   constant uuid := 'c0000000-0000-4000-8000-000000000010';
  v_elena  constant uuid := 'd0000000-0000-4000-8000-000000000005';
  v_david  constant uuid := 'd0000000-0000-4000-8000-000000000007';
  v_whit   constant uuid := 'd0000000-0000-4000-8000-000000000008';
  v_priya  constant uuid := 'd0000000-0000-4000-8000-000000000009';
  v_bell   constant uuid := 'd0000000-0000-4000-8000-000000000010';
  vd_evergreen constant uuid := 'e0000000-0000-4000-8000-000000000001';
  vd_summit    constant uuid := 'e0000000-0000-4000-8000-000000000002';
  vd_clear     constant uuid := 'e0000000-0000-4000-8000-000000000003';
  -- Services v2: the seeded requests (f = service request, numbered like the homeowner).
  sr_david constant uuid := 'f0000000-0000-4000-8000-000000000007';
  sr_whit  constant uuid := 'f0000000-0000-4000-8000-000000000008';
  sr_priya constant uuid := 'f0000000-0000-4000-8000-000000000009';
begin
  -- Review fix 3: wait for in-flight onboarding (save_home, set_home_appliances,
  -- start_plan hold this lock shared) and keep new onboarding out until the reset commits.
  perform pg_advisory_xact_lock(hashtextextended('php:demo-data', 0));

  -- Best effort: the demo logins exist and their profiles are restored.
  begin
    perform public.ensure_demo_users();
  exception when others then
    raise notice 'ensure_demo_users skipped: %', sqlerrm;
  end;

  -- 1. Transactional rows (WHERE true keeps safeupdate happy when called through the API).
  -- Services v2: requests and their photo rows first (storage objects are left in the bucket).
  delete from service_request_photos where true;
  delete from service_requests where true;
  delete from quote_bookings where true;
  delete from bids where true;
  delete from quote_requests where true;
  delete from reports where true;
  delete from visit_photos where true;
  delete from notices where true;
  delete from visit_tasks where true;
  delete from visits where true;
  delete from plans where true;
  delete from plan_builds where true;
  delete from appliances where true;
  delete from homes where true;

  -- 2. Pricing defaults (PRICING.md).
  insert into pricing_settings (id, labor_rate, trip_fee, parts_markup, tech_cost, vehicle_cost, coordination_fee)
  values (1, 94, 35, 0.25, 38, 12, 0.10)
  on conflict (id) do update
  set labor_rate = excluded.labor_rate, trip_fee = excluded.trip_fee, parts_markup = excluded.parts_markup,
      tech_cost = excluded.tech_cost, vehicle_cost = excluded.vehicle_cost, coordination_fee = excluded.coordination_fee;

  delete from task_defaults where task_key <> all (all_tasks);
  insert into task_defaults (task_key, name, labor_min, freq_high, freq_recommended, freq_medium, freq_low) values
    ('hvac',   'Replace HVAC filters ×2',        20,  6, 6, 4, 2),
    ('fridge', 'Replace fridge water filter',    10,  2, 2, 2, 1),
    ('ice',    'Drain & sanitize ice maker',     25,  4, 2, 2, 1),
    ('dish',   'Clean dishwasher filter & sump', 15, 12, 6, 4, 2),
    ('wh',     'Flush water heater',             40,  2, 2, 1, 1),
    ('dryer',  'Clean dryer vent',               30,  2, 1, 1, 0),
    ('smoke',  'Test smoke & CO detectors',      10,  4, 2, 2, 1)
  on conflict (task_key) do update
  set name = excluded.name, labor_min = excluded.labor_min, freq_high = excluded.freq_high,
      freq_recommended = excluded.freq_recommended, freq_medium = excluded.freq_medium, freq_low = excluded.freq_low;

  -- 3. Reference data.
  -- Services v2: the full 26-row catalog from private.service_catalog().
  insert into service_categories (id, line, handled_by, name, sub, base, season_months, sort)
  select c.id, c.line, c.handled_by, c.name, c.sub, c.base, c.season_months, c.sort from private.service_catalog() c
  on conflict (id) do update
  set line = excluded.line, handled_by = excluded.handled_by, name = excluded.name, sub = excluded.sub,
      base = excluded.base, season_months = excluded.season_months, sort = excluded.sort;
  delete from service_categories where id <> all (all_cats);

  insert into parts (part_number, description) values
    ('16x25x4-MERV11',  '16×25×4 MERV 11 filter, 2-pack'),
    ('LT1000P',         'LG LT1000P fridge water filter'),
    ('ICE-SANI',        'Ice maker sanitizer kit'),
    ('AFFRESH-DW',      'Affresh dishwasher cleaner tablets'),
    ('WH-DRAIN',        'Water heater drain hose kit'),
    ('9V',              '9V batteries, 4-pack'),
    ('DV-BRUSH',        'Dryer vent cleaning brush kit'),
    ('SMOKE-CO-10Y',    '10-year smoke & CO alarm'),
    ('16x25x4-MERV13',  '16×25×4 MERV 13 filter, 2-pack')
  on conflict (part_number) do update set description = excluded.description;

  delete from part_prices where part_id in (select id from parts where part_number in
    ('16x25x4-MERV11', 'LT1000P', 'ICE-SANI', 'AFFRESH-DW', 'WH-DRAIN', '9V', 'DV-BRUSH', 'SMOKE-CO-10Y', '16x25x4-MERV13'));
  -- Lowest in-stock price per part matches TASKS[].cost in packages/pricing.
  insert into part_prices (part_id, supplier, price, url, in_stock, fetched_at)
  select p.id, x.supplier, x.price, null, x.in_stock, now()
  from (values
    ('16x25x4-MERV11', 'Amazon',      76.80, true),
    ('16x25x4-MERV11', 'Lowe''s',     79.98, true),
    ('16x25x4-MERV11', 'Home Depot',  82.47, true),
    ('16x25x4-MERV11', 'Ferguson',    74.20, false),
    ('16x25x4-MERV11', 'SupplyHouse', 88.00, true),
    ('LT1000P',        'Amazon',      49.97, true),
    ('LT1000P',        'Lowe''s',     52.99, true),
    ('LT1000P',        'Home Depot',  54.97, true),
    ('LT1000P',        'SupplyHouse', 47.50, false),
    ('ICE-SANI',       'Amazon',       8.50, true),
    ('ICE-SANI',       'Home Depot',   9.98, true),
    ('AFFRESH-DW',     'Amazon',       4.20, true),
    ('AFFRESH-DW',     'Lowe''s',      4.48, true),
    ('AFFRESH-DW',     'Home Depot',   4.75, true),
    ('WH-DRAIN',       'Home Depot',   6.00, true),
    ('WH-DRAIN',       'SupplyHouse',  6.49, true),
    ('WH-DRAIN',       'Ferguson',     7.25, true),
    ('9V',             'Home Depot',  12.00, true),
    ('9V',             'Amazon',      12.49, true),
    ('9V',             'Lowe''s',     13.98, true),
    ('DV-BRUSH',       'Amazon',      19.99, true),
    ('DV-BRUSH',       'Home Depot',  24.97, true),
    ('SMOKE-CO-10Y',   'Home Depot',  42.97, true),
    ('SMOKE-CO-10Y',   'Lowe''s',     44.98, true),
    ('16x25x4-MERV13', 'Ferguson',    92.40, true),
    ('16x25x4-MERV13', 'Amazon',      94.99, true),
    ('16x25x4-MERV13', 'SupplyHouse', 96.00, false)
  ) as x(part_number, supplier, price, in_stock)
  join parts p on p.part_number = x.part_number;

  insert into appliance_models (brand, model, category, name, note, manual_url, extracted_at) values
    ('CARRIER CORP.',   '59TN6B100V21', 'hvac',         'Carrier Infinity furnace', 'Filter 16×25×4', null, now()),
    ('LG ELECTRONICS',  'LRMVS3006S',   'refrigerator', 'LG refrigerator',          'Filter LT1000P', null, now()),
    ('BSH HOME APPL.',  'SHPM88Z75N',   'dishwasher',   'Bosch 800 dishwasher',     'Filter monthly', null, now()),
    ('RHEEM MFG CO.',   'XE50T10H45U0', 'water_heater', 'Rheem water heater',       '11 yrs · flush', null, now()),
    ('WHIRLPOOL CORP.', 'WED5620HW',    'dryer',        'Whirlpool dryer',          'Vent yearly',    null, now())
  on conflict (model) do update
  set brand = excluded.brand, category = excluded.category, name = excluded.name, note = excluded.note;

  delete from model_tasks where model_id in (select id from appliance_models where model in
    ('59TN6B100V21', 'LRMVS3006S', 'SHPM88Z75N', 'XE50T10H45U0', 'WED5620HW'));
  insert into model_tasks (model_id, task_key, name, interval_months, part_number)
  select m.id, x.task_key, td.name, x.interval_months, x.part_number
  from (values
    ('59TN6B100V21', 'hvac',   2,  '16x25x4-MERV11'),
    ('LRMVS3006S',   'fridge', 6,  'LT1000P'),
    ('LRMVS3006S',   'ice',    6,  'ICE-SANI'),
    ('SHPM88Z75N',   'dish',   1,  'AFFRESH-DW'),
    ('XE50T10H45U0', 'wh',     6,  'WH-DRAIN'),
    ('WED5620HW',    'dryer',  12, null)
  ) as x(model, task_key, interval_months, part_number)
  join appliance_models m on m.model = x.model
  left join task_defaults td on td.task_key = x.task_key;

  -- Services v2: vendors cover every network category (maintenance and seasonal).
  insert into vendors (id, profile_id, company, categories, rating, service_radius_mi, vetted) values
    (vd_evergreen, (select id from profiles where id = u_sam), 'Evergreen Outdoor Co.', net_cats, 4.9, 25, true),
    (vd_summit,    null,                                       'Summit Pro Services',   net_cats, 4.8, 30, true),
    (vd_clear,     null,                                       'Clearview & Sons',      net_cats, 4.7, 30, true)
  on conflict (id) do update
  set profile_id = excluded.profile_id, company = excluded.company, categories = excluded.categories,
      rating = excluded.rating, service_radius_mi = excluded.service_radius_mi, vetted = excluded.vetted;
  delete from vendors where id not in (vd_evergreen, vd_summit, vd_clear);

  -- 4. Homes.
  insert into homes (id, owner_id, address, sqft, year_built, bedrooms, bathrooms, floors, hvac_zones, pets, water, notes, created_at) values
    (h_elena, u_elena, '12 Linden Court, Mountain Brook, AL 35213', 3420, 2006, 4, 3.5, 2, 2, true,  'city_hard',
     'Gate code 4471. Heater in garage, back left.', now()),
    (h_david, u_david, '4410 Bryn Mawr Dr, Homewood, AL 35209',    2850, 1998, 4, 3,   2, 2, false, 'city_hard',
     'Side gate latch sticks. Furnace in the attic.', now()),
    (h_whit,  u_whit,  '88 Beverly Dr, Mountain Brook, AL 35223',    5200, 1989, 5, 4.5, 2, 3, true,  'softened',
     'Two friendly dogs. Park in the circle drive.', now()),
    (h_priya, u_priya, '17 Stonebridge Dr, Vestavia Hills, AL 35216', 2100, 2015, 3, 2.5, 2, 1, false, 'well',
     'Ring the side door. Water heater in the utility closet.', now()),
    (h_bell,  u_bell,  '203 Lakewood Blvd, Birmingham, AL 35205',   2600, 1952, 3, 2,   1, 1, false, 'city_hard',
     'Garage code 0214. Please use the back entrance.', now());

  -- Elena's five appliances (apps/mobile/src/data/seed.ts APPLIANCES), linked to the model cache.
  insert into appliances (home_id, model_id, model, serial, brand, name, room)
  select h_elena, m.id, x.model, x.serial, x.brand, x.name, x.room
  from (values
    (1, 'CARRIER CORP.',   'Carrier Infinity furnace', '59TN6B100V21', '2419A83715',   'Utility closet'),
    (2, 'LG ELECTRONICS',  'LG refrigerator',          'LRMVS3006S',   '309KRBD4Y771', 'Kitchen'),
    (3, 'BSH HOME APPL.',  'Bosch 800 dishwasher',     'SHPM88Z75N',   'FD9912 00471', 'Kitchen'),
    (4, 'RHEEM MFG CO.',   'Rheem water heater',       'XE50T10H45U0', 'Q461504231',   'Garage'),
    (5, 'WHIRLPOOL CORP.', 'Whirlpool dryer',          'WED5620HW',    'C92814553',    'Laundry')
  ) as x(ord, brand, name, model, serial, room)
  join appliance_models m on m.model = x.model
  order by x.ord;

  -- 5. Plans (monthly/annual/materials/labor from packages/pricing at the defaults).
  insert into plans (id, home_id, tier, monthly, annual, materials, labor, starts_on, active) values
    (p_elena, h_elena, 'recommended', 137.58, 1651.01, 798.68,  852.33, d, true),
    (p_david, h_david, 'medium',       99.89, 1198.67, 588.67,  610.00, d, true),
    (p_whit,  h_whit,  'high',        186.79, 2241.43, 881.42, 1360.00, d, true),
    (p_priya, h_priya, 'recommended', 110.51, 1326.17, 599.17,  727.00, d, true),
    (p_bell,  h_bell,  'low',          50.91,  610.92, 298.09,  312.83, d, true);

  -- 6. Visits.
  insert into visits (id, plan_id, home_id, tech_id, window_start, window_end, status, confirmed_at, offered_slots)
  select x.id, x.plan_id, x.home_id, x.tech_id,
         private.chicago_at(d + x.day, x.t0), private.chicago_at(d + x.day, x.t1),
         'scheduled',
         case when x.confirmed then private.chicago_at(d - 2, time '10:00') end,
         jsonb_build_array(
           private.slot(d + x.day, x.t0, x.t1),
           private.slot(d + x.day + 1, time '13:00', time '15:00'),
           private.slot(d + x.day + 3, time '08:00', time '10:00'))
  from (values
    (v_elena, p_elena, h_elena, u_marcus, 0, time '09:00', time '11:00', false),
    (v_david, p_david, h_david, u_marcus, 0, time '12:00', time '14:00', true),
    (v_whit,  p_whit,  h_whit,  u_marcus, 0, time '15:00', time '17:00', true),
    (v_priya, p_priya, h_priya, u_dana,   1, time '09:00', time '11:00', false),
    (v_bell,  p_bell,  h_bell,  u_dana,   2, time '10:00', time '12:00', true)
  ) as x(id, plan_id, home_id, tech_id, day, t0, t1, confirmed);

  -- Baseline checklist per tier and home (adjustedFreq > 0). Only the Bells' low tier drops the dryer vent.
  insert into visit_tasks (visit_id, task_key, name, part_id, appliance_id)
  select x.visit_id, k.key, coalesce(td.name, k.key), private.task_part_id(k.key),
         private.home_appliance_for(x.home_id, k.key)
  from (values
    (v_elena, h_elena, all_tasks),
    (v_david, h_david, all_tasks),
    (v_whit,  h_whit,  all_tasks),
    (v_priya, h_priya, all_tasks),
    (v_bell,  h_bell,  array['hvac', 'fridge', 'ice', 'dish', 'wh', 'smoke'])
  ) as x(visit_id, home_id, keys)
  cross join lateral unnest(x.keys) with ordinality k(key, ord)
  left join task_defaults td on td.task_key = k.key
  order by x.visit_id, k.ord;

  -- The 7-day notice already went out for every visit.
  insert into notices (visit_id, kind, channel, sent_at)
  select v.id, '7d', 'email', v.window_start - interval '7 days'
  from visits v
  order by v.window_start
  on conflict do nothing;

  -- 7. Services v2 requests (docs/SERVICES_V2.md "Demo reset"): one per stage.
  --    David: a roof assessment tomorrow at 10:00. The Whitfields: a pool estimate
  --    waiting for approval. Priya: a "Show us" photo request routed to her visit
  --    (tomorrow, Dana), with its checklist task. Elena has none, so the presenter
  --    creates one live. No photo rows: the bucket has no seeded files to sign.
  insert into service_requests (id, home_id, requester_id, kind, category, title, description, room, urgency,
                                status, route, visit_id, assessment_at, estimate_low, estimate_high, office_note,
                                created_at, updated_at) values
    (sr_david, h_david, u_david, 'project', 'roof', 'Roof inspection after the last storm',
     'A few shingles came down in the last storm and there''s a new water stain on the upstairs hall ceiling. Can someone take a look?',
     'exterior', 'soon', 'assessment_scheduled', null, null,
     private.chicago_at(d + 1, time '10:00'), null, null, null,
     private.chicago_at(d - 2, time '18:40'), private.chicago_at(d - 1, time '09:15')),
    (sr_whit, h_whit, u_whit, 'project', 'pool', 'Pool resurfacing',
     'The plaster is rough and stained, and a few waterline tiles have popped off. We''d like it redone before next summer.',
     'exterior', 'whenever', 'estimate_sent', null, null,
     private.chicago_at(d - 6, time '14:00'), 18500, 22000,
     'Replaster in white quartz, new waterline tile and a start-up balance. About two weeks on site.',
     private.chicago_at(d - 12, time '11:05'), private.chicago_at(d - 2, time '16:30')),
    (sr_priya, h_priya, u_priya, 'photo', null, 'Back door sticks and won''t latch',
     'The back door off the kitchen sticks at the top and won''t latch unless you lean on it. Started after last week''s rain.',
     'kitchen', 'soon', 'scheduled', 'visit', v_priya,
     null, null, null, null,
     private.chicago_at(d - 1, time '19:20'), private.chicago_at(d - 1, time '20:05'));

  -- Priya's request on her visit's checklist, exactly as office_route_request adds it.
  insert into visit_tasks (visit_id, task_key, name, request_id)
  select r.visit_id, 'request', 'Client request: ' || r.title, r.id
  from service_requests r
  where r.id = sr_priya;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Privileges
-- ---------------------------------------------------------------------------

-- Private helpers: the RLS and storage ones are callable by authenticated (as
-- policies run as the caller); the rest only by the database owner and service role.
revoke execute on function
  private.service_catalog(), private.owned_service_request_ids(), private.tech_request_ids(),
  private.can_upload_request_photo(text), private.can_read_request_photo(text),
  private.open_quote_request(uuid, text), private.short_title(text)
  from public, anon;
grant execute on function
  private.owned_service_request_ids(), private.tech_request_ids(),
  private.can_upload_request_photo(text), private.can_read_request_photo(text)
  to authenticated;
grant execute on function
  private.service_catalog(), private.owned_service_request_ids(), private.tech_request_ids(),
  private.can_upload_request_photo(text), private.can_read_request_photo(text),
  private.open_quote_request(uuid, text), private.short_title(text)
  to service_role;

-- Client RPCs: signed-in users only (restated for the replaced ones so a replace can never widen them).
revoke execute on function
  public.create_service_request(text, text, text, text, text, text),
  public.add_service_request_photo(uuid, text),
  public.office_route_request(uuid, text, text, text),
  public.office_update_project(uuid, text, timestamptz, numeric, numeric, text),
  public.approve_estimate(uuid),
  public.cancel_service_request(uuid),
  public.request_quote(text),
  public.set_plan_tier(tier_key, numeric, numeric, numeric, numeric, text[])
  from public, anon;
grant execute on function
  public.create_service_request(text, text, text, text, text, text),
  public.add_service_request_photo(uuid, text),
  public.office_route_request(uuid, text, text, text),
  public.office_update_project(uuid, text, timestamptz, numeric, numeric, text),
  public.approve_estimate(uuid),
  public.cancel_service_request(uuid),
  public.request_quote(text),
  public.set_plan_tier(tier_key, numeric, numeric, numeric, numeric, text[])
  to authenticated;

-- Seeding: database owner (and service role) only.
revoke execute on function public.seed_demo(date) from public, anon, authenticated;
