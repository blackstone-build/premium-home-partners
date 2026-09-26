// Services v2 for the homeowner (docs/SERVICES_V2.md): the catalog grouped by
// line with "In season", my Show us requests and contracted projects, and their
// mutations. Live reads go through RLS (the owner sees only their own
// requests) and every write through an RPC; photos upload to `request-photos`
// after the request row exists. Demo runs the same flows on the zustand store.

import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { localPhotoUri } from '../components/camera';
import { useSession } from '../lib/auth';
import { FriendlyError, friendlyError } from '../lib/errors';
import { useMode } from '../lib/mode';
import { requestPhotoPath, uploadRequestPhoto, type CapturedPhoto } from '../lib/photos';
import { invalidateTables } from '../lib/realtime';
import { rpc, unwrap } from '../lib/rpc';
import { requireSupabase } from '../lib/supabase';
import { toast } from '../lib/toast';
import { useApp, type LocalServiceRequest } from '../store/app';
import { SERVICE_CATALOG } from './seed';
import {
  REQUEST_SELECT,
  REQUEST_TABLES,
  categoryName,
  chicagoMonth,
  groupCatalog,
  mapCategoryRow,
  mapServiceRequest,
  uuidFrom,
  type RequestKind,
  type Room,
  type ServiceCatalogVM,
  type ServiceCategory,
  type ServiceRequestRow,
  type ServiceRequestVM,
  type Urgency,
} from './servicesModel';
import { REQUEST_TASK_KEY, type TaskVM } from './visits';

export * from './servicesModel';

/** A read hook's result. `error` is only set when there's no data to show. */
export interface SvcQuery<T> {
  data?: T;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface SvcMutation<A> {
  mutate: (arg: A) => void;
  isPending: boolean;
  /** The argument of the call in flight. */
  variables: A | undefined;
}

const noop = () => {};

function useResult<T>(q: { data?: T; error: unknown; refetch: () => unknown }): SvcQuery<T> {
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

type Res = { data: unknown; error: unknown; status?: number };

export const SERVICE_KEYS = {
  catalog: ['services', 'catalog'] as const,
  mine: (userId: string | null) => ['homeowner', 'serviceRequests', userId] as const,
};

const CATALOG_TABLES = ['service_categories'];
/** Tables my requests read (the visit window for "Added to your Oct 14 visit"). */
export const MY_REQUEST_TABLES = [...REQUEST_TABLES, 'visits'];
const toastError = (e: unknown) => toast(friendlyError(e), 'brick');

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

async function fetchCatalog(): Promise<ServiceCategory[]> {
  // `*` so a database without the v2 columns still loads (mapCategoryRow fills them from the seed).
  const res = await requireSupabase().from('service_categories').select('*');
  const rows = unwrap<Record<string, unknown>[] | null>(res) ?? [];
  return rows.map(mapCategoryRow).filter((c): c is ServiceCategory => c !== null);
}

function useLiveServiceCatalog(): SvcQuery<ServiceCatalogVM> {
  const q = useQuery({
    queryKey: SERVICE_KEYS.catalog,
    queryFn: fetchCatalog,
    meta: { tables: CATALOG_TABLES },
    // The catalog changes with a migration, not during a demo.
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
  const month = chicagoMonth();
  const data = useMemo(() => (q.data ? groupCatalog(q.data, month) : undefined), [q.data, month]);
  return useResult({ data, error: q.error, refetch: q.refetch });
}

function useDemoServiceCatalog(): SvcQuery<ServiceCatalogVM> {
  const month = chicagoMonth();
  return useMemo(() => ({ data: groupCatalog(SERVICE_CATALOG, month), isLoading: false, error: null, refetch: noop }), [month]);
}

/** Every service, grouped Maintenance / Seasonal / Contracted, with `inSeason` for this Chicago month. */
export function useServiceCatalog(): SvcQuery<ServiceCatalogVM> {
  const { mode } = useMode();
  const useImpl = mode === 'live' ? useLiveServiceCatalog : useDemoServiceCatalog;
  return useImpl();
}

// ---------------------------------------------------------------------------
// My requests
// ---------------------------------------------------------------------------

/** Window starts for these visits (best effort: a failure only drops the day from the status line). */
export async function visitStarts(ids: readonly (string | null)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return {};
  try {
    const res = await requireSupabase().from('visits').select('id,window_start').in('id', unique);
    const rows = unwrap<{ id: string; window_start: string | null }[] | null>(res) ?? [];
    return Object.fromEntries(rows.filter((r) => r.window_start).map((r) => [r.id, r.window_start!]));
  } catch {
    return {};
  }
}

async function fetchMyRequests(): Promise<ServiceRequestVM[]> {
  const res = await requireSupabase()
    .from('service_requests')
    .select(REQUEST_SELECT)
    .neq('status', 'canceled')
    .order('created_at', { ascending: false })
    .limit(30);
  const rows = (unwrap(res as Res) as ServiceRequestRow[] | null) ?? [];
  const starts = await visitStarts(rows.map((r) => r.visit_id ?? null));
  return rows.map((r) => mapServiceRequest(r, { visitStart: r.visit_id ? (starts[r.visit_id] ?? null) : null }));
}

function useLiveMyServiceRequests(): SvcQuery<ServiceRequestVM[]> {
  const { userId } = useSession();
  const q = useQuery({
    queryKey: SERVICE_KEYS.mine(userId),
    queryFn: fetchMyRequests,
    enabled: !!userId,
    meta: { tables: MY_REQUEST_TABLES },
  });
  return useResult({ data: q.data, error: q.error, refetch: q.refetch });
}

/** A demo-store request → the same view model the live hooks return. */
export function localToVM(r: LocalServiceRequest, withClient = false): ServiceRequestVM {
  return {
    id: r.id,
    kind: r.kind,
    category: r.category,
    categoryName: categoryName(r.category),
    title: r.title,
    description: r.description,
    room: r.room,
    urgency: r.urgency,
    status: r.status,
    route: r.route,
    visitId: null,
    visitStart: null,
    visitLabel: r.visitLabel,
    quoteRequestId: null,
    assessmentAt: r.assessmentAt,
    estimateLow: r.estimateLow,
    estimateHigh: r.estimateHigh,
    officeNote: r.officeNote,
    createdAt: new Date(r.createdAt).toISOString(),
    photos: r.photos.map((p) => ({ id: p.id, path: null, uri: p.uri })),
    client: withClient ? { name: r.client, street: r.street } : null,
  };
}

function useDemoMyServiceRequests(): SvcQuery<ServiceRequestVM[]> {
  const svc = useApp((s) => s.svc);
  return useMemo(() => {
    const data = svc.filter((r) => r.mine && r.status !== 'canceled').map((r) => localToVM(r));
    return { data, isLoading: false, error: null, refetch: noop };
  }, [svc]);
}

/** My Show us requests and projects, newest first (canceled ones left out). */
export function useMyServiceRequests(): SvcQuery<ServiceRequestVM[]> {
  const { mode } = useMode();
  const useImpl = mode === 'live' ? useLiveMyServiceRequests : useDemoMyServiceRequests;
  return useImpl();
}

// ---------------------------------------------------------------------------
// Create (row first, then photos)
// ---------------------------------------------------------------------------

export interface NewServiceRequest {
  kind: RequestKind;
  category: string | null;
  description: string;
  room: Room | null;
  urgency: Urgency;
  photos: CapturedPhoto[];
}

export interface CreatedRequest {
  id: string;
  /** Photos that didn't upload; a toast offers Retry. */
  failedPhotos: number;
}

/** Photos whose upload failed, by request id, kept for the toast's Retry. */
const unsent = new Map<string, { photo: CapturedPhoto; path: string }[]>();

async function uploadPhotos(requestId: string, items: { photo: CapturedPhoto; path: string }[]) {
  const failed: { photo: CapturedPhoto; path: string }[] = [];
  let lastError: unknown = null;
  // One at a time, in order: the server allows at most four per request.
  for (const it of items) {
    try {
      await uploadRequestPhoto({ requestId, photo: it.photo, path: it.path });
    } catch (e) {
      failed.push(it);
      lastError = e;
    }
  }
  return { failed, lastError };
}

function offerRetry(requestId: string, failed: { photo: CapturedPhoto; path: string }[]) {
  if (!failed.length) {
    unsent.delete(requestId);
    return;
  }
  unsent.set(requestId, failed);
  const n = failed.length;
  toast(`Your request is in, but ${n === 1 ? 'a photo' : `${n} photos`} didn't upload.`, 'brick', {
    label: 'Retry',
    onPress: () => void retryRequestPhotos(requestId),
  });
}

/** Retry the photos of `requestId` that failed to upload. */
export async function retryRequestPhotos(requestId: string): Promise<void> {
  const items = unsent.get(requestId);
  if (!items?.length) return;
  const { failed } = await uploadPhotos(requestId, items);
  if (failed.length) offerRetry(requestId, failed);
  else {
    unsent.delete(requestId);
    toast(items.length === 1 ? 'Photo added' : 'Photos added', 'forest');
  }
}

async function createLive(r: NewServiceRequest): Promise<CreatedRequest> {
  const raw = await rpc<unknown>('create_service_request', {
    p_kind: r.kind,
    p_category: r.category,
    // The server titles it from the category name or the start of the description.
    p_title: null,
    p_description: r.description.trim(),
    p_room: r.room,
    p_urgency: r.urgency,
  });
  const id = uuidFrom(raw, ['id', 'request_id', 'create_service_request']);
  if (!id) throw new FriendlyError("We couldn't send your request. Try again.");
  void invalidateTables(REQUEST_TABLES);
  const items = r.photos.map((photo) => ({ photo, path: requestPhotoPath(id) }));
  const { failed } = await uploadPhotos(id, items);
  offerRetry(id, failed);
  return { id, failedPhotos: failed.length };
}

async function createDemo(r: NewServiceRequest): Promise<CreatedRequest> {
  const photos = await Promise.all(r.photos.map((p) => localPhotoUri(p)));
  const res = useApp.getState().createServiceRequest({
    kind: r.kind,
    category: r.category,
    description: r.description,
    room: r.room,
    urgency: r.urgency,
    photos,
  });
  if ('error' in res) throw new FriendlyError(res.error);
  return { id: res.id, failedPhotos: 0 };
}

/**
 * Send a Show us request or a project assessment request. Live: the row
 * (create_service_request), then each photo to `request-photos` and
 * add_service_request_photo. A failed photo keeps the request and toasts Retry.
 * `submit` rejects with a FriendlyError when the request itself isn't created.
 */
export function useCreateServiceRequest(): { submit: (r: NewServiceRequest) => Promise<CreatedRequest>; isPending: boolean } {
  const { mode } = useMode();
  const m = useMutation({ mutationFn: mode === 'live' ? createLive : createDemo });
  const { mutateAsync, isPending } = m;
  return useMemo(() => ({ submit: mutateAsync, isPending }), [mutateAsync, isPending]);
}

// ---------------------------------------------------------------------------
// Approve / cancel
// ---------------------------------------------------------------------------

function useRequestRpc(fn: 'approve_estimate' | 'cancel_service_request', done: string, demo: (id: string) => string | null): SvcMutation<string> {
  const { mode } = useMode();
  const m = useMutation({
    mutationFn: (id: string) => rpc<unknown>(fn, { p_request_id: id }),
    onError: (e) => {
      toastError(e);
      void invalidateTables(REQUEST_TABLES);
    },
    onSuccess: async () => {
      await invalidateTables(REQUEST_TABLES);
      toast(done, 'forest');
    },
  });
  const demoMutate = useCallback(
    (id: string) => {
      const err = demo(id);
      toast(err ?? done, err ? 'brick' : 'forest');
    },
    [demo, done],
  );
  if (mode === 'demo') return { mutate: demoMutate, isPending: false, variables: undefined };
  return { mutate: m.mutate, isPending: m.isPending, variables: m.variables };
}

/** Approve a project's estimate (estimate_sent → approved). */
export function useApproveEstimate(): SvcMutation<string> {
  const approve = useApp((s) => s.approveEstimate);
  return useRequestRpc('approve_estimate', "Estimate approved. We'll schedule the work.", approve);
}

/** Cancel my request while it's new, reviewing, scheduled for an assessment or waiting on my approval. */
export function useCancelServiceRequest(): SvcMutation<string> {
  const cancel = useApp((s) => s.cancelServiceRequest);
  return useRequestRpc('cancel_service_request', 'Request canceled', cancel);
}

// ---------------------------------------------------------------------------
// Demo: client-request tasks on Elena's visit (tech checklist + Home tab)
// ---------------------------------------------------------------------------

/** Checklist tasks for my requests the office added to the demo visit. Task ids are `req-<request id>`. */
export function demoRequestTasks(svc: readonly LocalServiceRequest[], done: Record<string, boolean>, shots: Record<string, boolean>): TaskVM[] {
  return svc
    .filter((r) => r.mine && r.route === 'visit' && r.status === 'scheduled')
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => {
      const id = `req-${r.id}`;
      return {
        id,
        key: REQUEST_TASK_KEY,
        name: `Client request: ${r.title}`,
        short: r.title,
        part: '—',
        min: 0,
        done: !!done[id],
        photoKind: 'after' as const,
        photos: shots[id] ? [{ id: `demo-${id}`, kind: 'after', path: '' }] : [],
        request: {
          id: r.id,
          title: r.title,
          description: r.description,
          room: r.room,
          urgency: r.urgency,
          photos: r.photos.map((p) => ({ id: p.id, path: null, uri: p.uri })),
        },
      };
    });
}

/** The demo store's client-request tasks for the visit, live as the office routes them. */
export function useDemoRequestTasks(): TaskVM[] {
  const { svc, done, shots } = useApp(useShallow((s) => ({ svc: s.svc, done: s.done, shots: s.shots })));
  return useMemo(() => demoRequestTasks(svc, done, shots), [svc, done, shots]);
}
