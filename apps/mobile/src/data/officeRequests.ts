// Office: client requests (docs/SERVICES_V2.md, Office). Every Show us request
// and contracted project with its client, address and photos (signed
// `request-photos` URLs), plus the office's writes: office_route_request
// (next visit / partner quotes / project / reply) and office_update_project
// (assessment, estimate, start, done, decline). A `quotes` route fans the new
// quote request out to the network with fanout-quote, exactly as the homeowner
// app does after request_quote. Demo runs the same rules on the zustand store.

import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { friendlyError } from '../lib/errors';
import { useMode } from '../lib/mode';
import { REQUEST_PHOTO_BUCKET, getSignedUrls } from '../lib/photos';
import { invalidateTables } from '../lib/realtime';
import { invokeFunction, rpc, unwrap } from '../lib/rpc';
import { requireSupabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { useApp } from '../store/app';
import { localToVM, visitStarts } from './services';
import {
  OFFICE_REQUEST_SELECT,
  REQUEST_TABLES,
  inOfficeFilter,
  mapServiceRequest,
  uuidFrom,
  type OfficeFilter,
  type RequestRoute,
  type RequestStatus,
  type ServiceRequestRow,
  type ServiceRequestVM,
} from './servicesModel';

export interface OfficeReqQuery<T> {
  data?: T;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface OfficeRequestsData {
  /** Newest first. */
  rows: ServiceRequestVM[];
  counts: Record<OfficeFilter, number>;
}

type Res = { data: unknown; error: unknown; status?: number };
const noop = () => {};

export const OFFICE_REQUEST_TABLES = [...REQUEST_TABLES, 'homes', 'profiles', 'visits'];
/** Everything a routing decision can touch, so every screen that shows it refetches. */
const ROUTE_TABLES = [...REQUEST_TABLES, 'visit_tasks', 'visits', 'quote_requests', 'bids'];

function countAll(rows: readonly ServiceRequestVM[]): Record<OfficeFilter, number> {
  const counts: Record<OfficeFilter, number> = { new: 0, projects: 0, routed: 0, closed: 0 };
  for (const r of rows) for (const f of Object.keys(counts) as OfficeFilter[]) if (inOfficeFilter(r, f)) counts[f]++;
  return counts;
}

async function fetchOfficeRequests(): Promise<OfficeRequestsData> {
  const res = await requireSupabase().from('service_requests').select(OFFICE_REQUEST_SELECT).order('created_at', { ascending: false }).limit(200);
  const rows = (unwrap(res as Res) as ServiceRequestRow[] | null) ?? [];
  const paths = rows.flatMap((r) => (r.service_request_photos ?? []).map((p) => p.path).filter((p): p is string => !!p));
  const [starts, signed] = await Promise.all([
    visitStarts(rows.map((r) => r.visit_id ?? null)),
    // Cached per path until shortly before expiry, so a poll doesn't re-sign. Thumbnails sign themselves if this fails.
    paths.length ? getSignedUrls(paths, REQUEST_PHOTO_BUCKET).catch(() => ({}) as Record<string, string>) : Promise.resolve({} as Record<string, string>),
  ]);
  const vms = rows.map((r) => mapServiceRequest(r, { visitStart: r.visit_id ? (starts[r.visit_id] ?? null) : null, signed }));
  return { rows: vms, counts: countAll(vms) };
}

function useLiveOfficeRequests(): OfficeReqQuery<OfficeRequestsData> {
  const q = useQuery({
    queryKey: ['office', 'requests'],
    queryFn: fetchOfficeRequests,
    meta: { tables: OFFICE_REQUEST_TABLES },
  });
  const { data, error, refetch } = q;
  return useMemo(
    () => ({
      data,
      isLoading: data === undefined && !error,
      error: data === undefined && error ? friendlyError(error) : null,
      refetch: () => void refetch(),
    }),
    [data, error, refetch],
  );
}

function useDemoOfficeRequests(): OfficeReqQuery<OfficeRequestsData> {
  const svc = useApp((s) => s.svc);
  return useMemo(() => {
    const rows = [...svc].sort((a, b) => b.createdAt - a.createdAt).map((r) => localToVM(r, true));
    return { data: { rows, counts: countAll(rows) }, isLoading: false, error: null, refetch: noop };
  }, [svc]);
}

/** Every client request (Show us + projects), newest first, with per-filter counts. */
export function useOfficeRequests(): OfficeReqQuery<OfficeRequestsData> {
  const { mode } = useMode();
  const useImpl = mode === 'live' ? useLiveOfficeRequests : useDemoOfficeRequests;
  return useImpl();
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface RouteArgs {
  id: string;
  route: RequestRoute;
  /** Network category for `quotes`, contracted category for `project`. */
  category?: string | null;
  /** Required for `advice` (the reply); optional otherwise. */
  note?: string | null;
}

export interface ProjectArgs {
  id: string;
  status: RequestStatus;
  /** ISO instant, for assessment_scheduled. */
  assessmentAt?: string | null;
  low?: number | null;
  high?: number | null;
  /** Required to decline. */
  note?: string | null;
}

export interface OfficeWrite<A> {
  /** Resolves true when it worked; errors are toasted (brick). */
  run: (arg: A) => Promise<boolean>;
  pending: boolean;
  /** The argument of the call in flight. */
  variables: A | undefined;
}

const ROUTE_DONE: Record<RequestRoute, string> = {
  visit: 'Added to the next visit',
  quotes: 'Sent to partners for quotes',
  project: 'Project started',
  advice: 'Reply sent',
};

const PROJECT_DONE: Partial<Record<RequestStatus, string>> = {
  assessment_scheduled: 'Assessment scheduled',
  estimate_sent: 'Estimate sent',
  in_progress: 'Work started',
  done: 'Marked done',
  declined: 'Request declined',
};

/** office_route_request; for `quotes`, then fanout-quote on the new quote request (fire-and-forget). */
export async function routeRequestLive(a: RouteArgs): Promise<void> {
  const res = await rpc<unknown>('office_route_request', {
    p_request_id: a.id,
    p_route: a.route,
    p_category: a.category ?? null,
    p_note: a.note?.trim() || null,
  });
  if (a.route === 'quotes') {
    // Returns {request_id, route, status, kind, category, visit_id, visit_task_id, quote_request_id}.
    const qid = uuidFrom(res, ['quote_request_id']);
    // Fire-and-forget, as after request_quote. If it fails the request still reads
    // "quoted" and Evergreen can bid; the office hears that the auto-bids didn't start.
    if (qid) {
      invokeFunction('fanout-quote', { request_id: qid }).catch((e) =>
        toast(`Sent for quotes, but partner bids didn't start: ${friendlyError(e)}`, 'brick'),
      );
    }
  }
  await invalidateTables(ROUTE_TABLES);
}

export async function updateProjectLive(a: ProjectArgs): Promise<void> {
  await rpc<unknown>('office_update_project', {
    p_request_id: a.id,
    p_status: a.status,
    p_assessment_at: a.assessmentAt ?? null,
    p_estimate_low: a.low ?? null,
    p_estimate_high: a.high ?? null,
    p_note: a.note?.trim() || null,
  });
  await invalidateTables(REQUEST_TABLES);
}

function useOfficeWrite<A>(live: (a: A) => Promise<void>, demo: (a: A) => string | null, done: (a: A) => string): OfficeWrite<A> {
  const { mode } = useMode();
  const m = useMutation({
    mutationFn: live,
    onSuccess: (_d, a) => toast(done(a), 'forest'),
    onError: (e) => {
      toast(friendlyError(e), 'brick');
      void invalidateTables(REQUEST_TABLES);
    },
  });
  const { mutateAsync, isPending, variables } = m;
  const runLive = useCallback((a: A) => mutateAsync(a).then(() => true, () => false), [mutateAsync]);
  const runDemo = useCallback(
    (a: A) => {
      const err = demo(a);
      toast(err ?? done(a), err ? 'brick' : 'forest');
      return Promise.resolve(!err);
    },
    [demo, done],
  );
  return useMemo(
    () => (mode === 'live' ? { run: runLive, pending: isPending, variables } : { run: runDemo, pending: false, variables: undefined }),
    [mode, runLive, runDemo, isPending, variables],
  );
}

/** Route a new request: next visit, partner quotes (category), a project (category) or a reply (note). */
export function useRouteRequest(): OfficeWrite<RouteArgs> {
  const route = useApp((s) => s.routeServiceRequest);
  const demo = useCallback((a: RouteArgs) => route(a.id, a.route, a.category ?? null, a.note ?? null), [route]);
  const done = useCallback((a: RouteArgs) => ROUTE_DONE[a.route], []);
  return useOfficeWrite(routeRequestLive, demo, done);
}

/** Move a project along: assessment, estimate, start, done, or decline (with a note). */
export function useUpdateProject(): OfficeWrite<ProjectArgs> {
  const update = useApp((s) => s.updateServiceProject);
  const demo = useCallback(
    (a: ProjectArgs) => update(a.id, { status: a.status, assessmentAt: a.assessmentAt, low: a.low, high: a.high, note: a.note }),
    [update],
  );
  const done = useCallback((a: ProjectArgs) => PROJECT_DONE[a.status] ?? 'Updated', []);
  return useOfficeWrite(updateProjectLive, demo, done);
}

/** New requests waiting on the office (the nav badge). Live polls with the list; demo reads the store. */
export function useNewRequestCount(): number {
  const q = useOfficeRequests();
  return q.data?.counts.new ?? 0;
}
