-- Production guard for demo seeding.
--
-- seed_demo() and ensure_demo_users() refuse when this database is marked
-- production. The morning cron skips that case instead of wiping rows.
-- Unset (the default) keeps the presentation demo and the test suite working.
--
-- On a production project only, as a superuser, for new connections:
--   alter database postgres set app.environment = 'production';
-- Optionally stop the job entirely:
--   select cron.unschedule('php-daily-demo-reset');

create or replace function private.demo_seed_allowed() returns void
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
begin
  if coalesce(current_setting('app.environment', true), '') = 'production' then
    raise exception 'Demo data is turned off on this production database.'
      using errcode = 'P0001';
  end if;
end
$$;

revoke all on function private.demo_seed_allowed() from public, anon, authenticated;

alter function public.seed_demo(date) rename to seed_demo_scenario;
alter function public.ensure_demo_users() rename to ensure_demo_users_accounts;

create or replace function public.seed_demo(p_today date default (now() at time zone 'America/Chicago')::date) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform private.demo_seed_allowed();
  perform public.seed_demo_scenario(p_today);
end
$$;

create or replace function public.ensure_demo_users() returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform private.demo_seed_allowed();
  perform public.ensure_demo_users_accounts();
end
$$;

revoke all on function
  public.seed_demo(date),
  public.seed_demo_scenario(date),
  public.ensure_demo_users(),
  public.ensure_demo_users_accounts()
  from public, anon, authenticated;

-- Reschedule the morning job so a production database no-ops instead of erroring.
do $guard$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron not available; daily demo reset left as previously scheduled';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'php-daily-demo-reset';
  perform cron.schedule(
    'php-daily-demo-reset',
    '7 9 * * *',
    $cron$select case when coalesce(current_setting('app.environment', true), '') = 'production' then null else public.seed_demo() end$cron$
  );
end
$guard$;
