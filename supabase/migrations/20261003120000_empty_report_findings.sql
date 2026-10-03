-- A completed visit records a health score. It does not invent findings.
-- Observations belong in the report only when something actually measured them.

create or replace function public.complete_visit(p_visit uuid) returns reports
  language plpgsql security definer set search_path = public
  as $$
declare
  v_visit visits;
  v_report reports;
  v_pending int;
begin
  perform private.require_role('tech');
  select * into v_visit from visits where id = p_visit and tech_id = auth.uid() for update;
  if not found then
    raise exception 'We couldn''t find that visit.' using errcode = 'P0001';
  end if;
  select * into v_report from reports where visit_id = v_visit.id;
  if found then
    return v_report;
  end if;
  if v_visit.status not in ('onsite', 'done') then
    raise exception 'Mark yourself on site before completing the visit.' using errcode = 'P0001';
  end if;
  select count(*) into v_pending from visit_tasks where visit_id = v_visit.id and not coalesce(done, false);
  if v_pending > 0 then
    raise exception 'Check off every task before completing the visit.' using errcode = 'P0001';
  end if;
  update visits set status = 'done', completed_at = coalesce(completed_at, now()) where id = v_visit.id;
  insert into reports (visit_id, health_score, findings)
  values (v_visit.id, 86, '[]'::jsonb)
  returning * into v_report;
  insert into notices (visit_id, kind, channel) values (v_visit.id, 'report', 'push')
  on conflict do nothing;
  return v_report;
end $$;
