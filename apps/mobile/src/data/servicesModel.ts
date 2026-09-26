// Services v2 view models and pure helpers (docs/SERVICES_V2.md): the catalog
// grouped by line with "In season", service requests (Show us + contracted
// projects), their status lines, and the office filters. No React and no
// client, so it's unit-tested in test/services.test.ts.

import { money } from '@php/pricing';
import { fmtShortDate, fmtTime, wallClock } from '../lib/dates';
import { SERVICE_CATALOG, type HandledBy, type ServiceCategory, type ServiceLine } from './seed';

export type { HandledBy, ServiceCategory, ServiceLine } from './seed';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const SERVICE_LINES: readonly { key: ServiceLine; label: string }[] = [
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'seasonal', label: 'Seasonal' },
  { key: 'contracted', label: 'Contracted' },
];

const LINE_KEYS: readonly ServiceLine[] = ['maintenance', 'seasonal', 'contracted'];

export interface ServiceCategoryVM extends ServiceCategory {
  /** The current Chicago month is in `seasonMonths`. False for year-round services. */
  inSeason: boolean;
}

export interface ServiceCatalogVM {
  /** Each line's services: in season first (Seasonal), then by `sort`. */
  lines: Record<ServiceLine, ServiceCategoryVM[]>;
  all: ServiceCategoryVM[];
  /** Month (1–12, Chicago) used for `inSeason`. */
  month: number;
}

/** The Chicago calendar month (1–12) for `now`. */
export function chicagoMonth(now: Date | number = new Date()): number {
  return wallClock(now).m;
}

export function isInSeason(c: Pick<ServiceCategory, 'seasonMonths'>, month: number): boolean {
  return Array.isArray(c.seasonMonths) && c.seasonMonths.includes(month);
}

const num = (x: unknown, fallback: number | null = null): number | null => {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const str = (x: unknown): string => (typeof x === 'string' ? x : '');

function months(x: unknown): number[] | null {
  // PostgREST returns smallint[] as a JSON array; tolerate a '{10,11}' literal too.
  const arr = Array.isArray(x) ? x : typeof x === 'string' && /^\{[\d,\s]*\}$/.test(x) ? x.slice(1, -1).split(',') : null;
  if (!arr) return null;
  const out = arr.map((m) => num(m)).filter((m): m is number => m !== null && m >= 1 && m <= 12);
  return out.length ? out : null;
}

/**
 * A `service_categories` row → ServiceCategory. Tolerant of a database that
 * hasn't got the v2 columns yet: `line`, `handled_by`, `season_months` and
 * `sort` fall back to the seed catalog's entry for that id.
 */
export function mapCategoryRow(row: Record<string, unknown>): ServiceCategory | null {
  const id = str(row.id).trim();
  if (!id) return null;
  const seed = SERVICE_CATALOG.find((c) => c.id === id);
  const line = LINE_KEYS.includes(row.line as ServiceLine) ? (row.line as ServiceLine) : (seed?.line ?? 'maintenance');
  const handledBy: HandledBy = row.handled_by === 'php' || row.handled_by === 'network' ? row.handled_by : (seed?.handledBy ?? (line === 'contracted' ? 'php' : 'network'));
  return {
    id,
    line,
    handledBy,
    name: str(row.name).trim() || seed?.name || id,
    sub: str(row.sub).trim() || seed?.sub || '',
    base: num(row.base, seed?.base ?? null),
    seasonMonths: 'season_months' in row ? months(row.season_months) : (seed?.seasonMonths ?? null),
    sort: num(row.sort, seed?.sort ?? 999) ?? 999,
  };
}

/** Group by line; Seasonal puts in-season services first. */
export function groupCatalog(cats: readonly ServiceCategory[], month: number): ServiceCatalogVM {
  const all = cats.map((c) => ({ ...c, inSeason: isInSeason(c, month) }));
  const lines: Record<ServiceLine, ServiceCategoryVM[]> = { maintenance: [], seasonal: [], contracted: [] };
  for (const c of all) lines[c.line].push(c);
  for (const key of LINE_KEYS) {
    lines[key].sort(
      (a, b) =>
        (key === 'seasonal' ? Number(b.inSeason) - Number(a.inSeason) : 0) || a.sort - b.sort || a.name.localeCompare(b.name),
    );
  }
  return { lines, all, month };
}

/** The display name of a category id (seed catalog), or null. */
export function categoryName(id: string | null | undefined, cats: readonly ServiceCategory[] = SERVICE_CATALOG): string | null {
  if (!id) return null;
  return cats.find((c) => c.id === id)?.name ?? null;
}

export const NETWORK_CATEGORIES = SERVICE_CATALOG.filter((c) => c.handledBy === 'network');
export const CONTRACTED_CATEGORIES = SERVICE_CATALOG.filter((c) => c.line === 'contracted');

// ---------------------------------------------------------------------------
// Service requests
// ---------------------------------------------------------------------------

export type RequestKind = 'photo' | 'project';
export type Room = 'kitchen' | 'bath' | 'bedroom' | 'living' | 'exterior' | 'garage' | 'other';
export type Urgency = 'whenever' | 'soon' | 'urgent';
export type RequestStatus =
  | 'new'
  | 'reviewing'
  | 'assessment_scheduled'
  | 'estimate_sent'
  | 'approved'
  | 'in_progress'
  | 'done'
  | 'scheduled'
  | 'quoted'
  | 'closed'
  | 'declined'
  | 'canceled';
export type RequestRoute = 'visit' | 'quotes' | 'project' | 'advice';

export const ROOMS: readonly { key: Room; label: string }[] = [
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bath', label: 'Bath' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'living', label: 'Living' },
  { key: 'exterior', label: 'Exterior' },
  { key: 'garage', label: 'Garage' },
  { key: 'other', label: 'Other' },
];

export const URGENCIES: readonly { key: Urgency; label: string }[] = [
  { key: 'whenever', label: 'Whenever' },
  { key: 'soon', label: 'Soon' },
  { key: 'urgent', label: 'Urgent' },
];

const STATUSES: readonly RequestStatus[] = [
  'new',
  'reviewing',
  'assessment_scheduled',
  'estimate_sent',
  'approved',
  'in_progress',
  'done',
  'scheduled',
  'quoted',
  'closed',
  'declined',
  'canceled',
];
const ROUTES: readonly RequestRoute[] = ['visit', 'quotes', 'project', 'advice'];

/** At most this many photos per request (add_service_request_photo enforces it too). */
export const MAX_REQUEST_PHOTOS = 4;
export const DESCRIPTION_MAX = 1000;

/** The owner can cancel while the request is in one of these. */
export const CANCELABLE: readonly RequestStatus[] = ['new', 'reviewing', 'assessment_scheduled', 'estimate_sent'];
/** office_route_request accepts these. */
export const ROUTABLE: readonly RequestStatus[] = ['new', 'reviewing'];
/** Finished one way or another. */
export const CLOSED_STATUSES: readonly RequestStatus[] = ['done', 'closed', 'declined', 'canceled'];
/** A project can be declined from any open status (office_update_project). */
export const DECLINABLE: readonly RequestStatus[] = ['new', 'reviewing', 'assessment_scheduled', 'estimate_sent', 'approved', 'in_progress'];

export interface RequestPhotoVM {
  id: string;
  /** Storage path in `request-photos` (live). */
  path: string | null;
  /** A ready-to-show URL: a signed URL (office), or a local URI (demo). */
  uri: string | null;
}

export interface ServiceRequestVM {
  id: string;
  kind: RequestKind;
  category: string | null;
  categoryName: string | null;
  title: string;
  description: string;
  room: Room | null;
  urgency: Urgency;
  status: RequestStatus;
  route: RequestRoute | null;
  visitId: string | null;
  /** ISO start of the linked visit, when known. */
  visitStart: string | null;
  /** Preformatted visit day (demo), used when there's no ISO start. */
  visitLabel: string | null;
  quoteRequestId: string | null;
  assessmentAt: string | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  officeNote: string | null;
  createdAt: string;
  photos: RequestPhotoVM[];
  /** Office only: who asked and where. */
  client: { name: string; street: string } | null;
}

type One<T> = T | T[] | null | undefined;
const one = <T,>(x: One<T>): T | null => (Array.isArray(x) ? (x[0] ?? null) : (x ?? null));

export interface ServiceRequestRow {
  id: string;
  kind?: string | null;
  category?: string | null;
  title?: string | null;
  description?: string | null;
  room?: string | null;
  urgency?: string | null;
  status?: string | null;
  route?: string | null;
  visit_id?: string | null;
  quote_request_id?: string | null;
  assessment_at?: string | null;
  estimate_low?: unknown;
  estimate_high?: unknown;
  office_note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  service_request_photos?: { id: string; path: string | null; created_at?: string | null }[] | null;
  homes?: One<{ address?: string | null; owner?: One<{ full_name: string | null }> }>;
}

/** PostgREST select for a request with its photos (homeowner + tech). */
export const REQUEST_SELECT =
  'id,kind,category,title,description,room,urgency,status,route,visit_id,quote_request_id,assessment_at,estimate_low,estimate_high,office_note,created_at,updated_at,service_request_photos(id,path,created_at)';
/** The office also reads the client's name and address. */
export const OFFICE_REQUEST_SELECT = `${REQUEST_SELECT},homes(address,owner:profiles!homes_owner_id_fkey(full_name))`;
export const REQUEST_TABLES = ['service_requests', 'service_request_photos'];

export function asStatus(x: unknown): RequestStatus {
  return STATUSES.includes(x as RequestStatus) ? (x as RequestStatus) : 'new';
}

/** A `service_requests` row → ServiceRequestVM. Unknown values fall back to safe defaults. */
export function mapServiceRequest(
  row: ServiceRequestRow,
  extras: { visitStart?: string | null; signed?: Record<string, string> } = {},
): ServiceRequestVM {
  const home = one(row.homes);
  const owner = one(home?.owner);
  const category = row.category?.trim() || null;
  const description = str(row.description).trim();
  const title = str(row.title).trim() || defaultTitle(categoryName(category), description);
  const photos = [...(row.service_request_photos ?? [])]
    .filter((p) => !!p && typeof p.path === 'string' && p.path)
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id))
    .map((p) => ({ id: p.id, path: p.path, uri: extras.signed?.[p.path!] ?? null }));
  const kind: RequestKind = row.kind === 'project' ? 'project' : 'photo';
  const room = ROOMS.some((r) => r.key === row.room) ? (row.room as Room) : null;
  const urgency = URGENCIES.some((u) => u.key === row.urgency) ? (row.urgency as Urgency) : 'whenever';
  const address = home?.address ?? '';
  return {
    id: row.id,
    kind,
    category,
    categoryName: categoryName(category),
    title,
    description,
    room,
    urgency,
    status: asStatus(row.status),
    route: ROUTES.includes(row.route as RequestRoute) ? (row.route as RequestRoute) : null,
    visitId: row.visit_id ?? null,
    visitStart: extras.visitStart ?? null,
    visitLabel: null,
    quoteRequestId: row.quote_request_id ?? null,
    assessmentAt: row.assessment_at ?? null,
    estimateLow: num(row.estimate_low),
    estimateHigh: num(row.estimate_high),
    officeNote: row.office_note?.trim() || null,
    createdAt: row.created_at ?? '',
    photos,
    client: home ? { name: owner?.full_name?.trim() || 'Client', street: address.split(',')[0]?.trim() ?? '' } : null,
  };
}

/**
 * create_service_request's default title (private.short_title): the category
 * name, else the description with whitespace collapsed, cut at a word with an
 * ellipsis when it's longer than 80 characters.
 */
export function defaultTitle(category: string | null, description: string): string {
  if (category?.trim()) return category.trim();
  const s = description.replace(/\s+/g, ' ').trim();
  if (s.length <= 80) return s || 'Request';
  const cut = s.slice(0, 79).replace(/\s+\S*$/, '');
  return `${cut || s.slice(0, 79)}…`;
}

/** The title is just the description (or its start), so cards show the description instead of both. */
export function titleRepeatsDescription(title: string, description: string): boolean {
  const d = description.replace(/\s+/g, ' ').trim();
  const t = title.trim();
  if (!t || !d) return false;
  return t === d || (t.endsWith('…') && d.startsWith(t.slice(0, -1).trimEnd()));
}

/**
 * An RPC's uuid result. Tolerates a bare uuid string, `{ id }`, `{ <key>: uuid }`
 * and a one-row array, so the client keeps working whichever way the function returns it.
 */
export function uuidFrom(x: unknown, keys: readonly string[] = ['id']): string | null {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof x === 'string') return UUID.test(x.trim()) ? x.trim() : null;
  if (Array.isArray(x)) return x.length ? uuidFrom(x[0], keys) : null;
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    for (const k of keys) {
      const v = uuidFrom(o[k], keys);
      if (v) return v;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export type LineTone = 'neutral' | 'forest' | 'ochre' | 'brick' | 'slate';

export const roomLabel = (r: Room | null) => ROOMS.find((x) => x.key === r)?.label ?? null;
export const urgencyLabel = (u: Urgency) => URGENCIES.find((x) => x.key === u)?.label ?? 'Whenever';

/** `'$18,500 – $22,000'` */
export function estimateRange(low: number | null, high: number | null): string {
  if (low == null && high == null) return '';
  if (low == null || high == null || low === high) return money((low ?? high)!);
  return `${money(low)} – ${money(high)}`;
}

/** `'Oct 14'` */
export function monthDay(iso: string): string {
  return fmtShortDate(iso).split(', ')[1] ?? fmtShortDate(iso);
}

/** `'Tue, Sep 29 · 10:00 AM'` */
export function whenLabel(iso: string): string {
  return `${fmtShortDate(iso)} · ${fmtTime(iso)}`;
}

/** The office badge for a status. */
export const STATUS_LABEL: Record<RequestStatus, { label: string; tone: LineTone }> = {
  new: { label: 'New', tone: 'ochre' },
  reviewing: { label: 'Reviewing', tone: 'slate' },
  assessment_scheduled: { label: 'Assessment scheduled', tone: 'slate' },
  estimate_sent: { label: 'Estimate sent', tone: 'slate' },
  approved: { label: 'Approved', tone: 'forest' },
  in_progress: { label: 'In progress', tone: 'slate' },
  done: { label: 'Done', tone: 'forest' },
  scheduled: { label: 'On next visit', tone: 'forest' },
  quoted: { label: 'Partner quotes', tone: 'forest' },
  closed: { label: 'Replied', tone: 'neutral' },
  declined: { label: 'Declined', tone: 'brick' },
  canceled: { label: 'Canceled', tone: 'neutral' },
};

/** The homeowner's live status line for a request card. */
export function homeownerStatusLine(r: ServiceRequestVM): { text: string; tone: LineTone } {
  switch (r.status) {
    case 'new':
      return { text: r.kind === 'project' ? "Sent · we'll set up an assessment" : "Sent · we'll take a look shortly", tone: 'ochre' };
    case 'reviewing':
      return { text: r.kind === 'project' ? 'A project manager is on it' : "We're reviewing it", tone: 'slate' };
    case 'assessment_scheduled':
      return { text: r.assessmentAt ? `Assessment · ${whenLabel(r.assessmentAt)}` : 'Assessment scheduled', tone: 'slate' };
    case 'estimate_sent':
      return { text: 'Your estimate is ready', tone: 'slate' };
    case 'approved':
      return { text: "Approved · we'll schedule the work", tone: 'forest' };
    case 'in_progress':
      return { text: 'Work in progress', tone: 'slate' };
    case 'done':
      return { text: 'Done ✓', tone: 'forest' };
    case 'scheduled': {
      const day = r.visitStart ? monthDay(r.visitStart) : r.visitLabel;
      return { text: day ? `Added to your ${day} visit` : 'Added to your next visit', tone: 'forest' };
    }
    case 'quoted':
      return { text: 'Quotes on the way', tone: 'forest' };
    case 'closed':
      return { text: r.officeNote ? `We replied: ${r.officeNote}` : 'We replied', tone: 'neutral' };
    case 'declined':
      return { text: r.officeNote ? `We can't take this on: ${r.officeNote}` : "We can't take this one on", tone: 'brick' };
    case 'canceled':
      return { text: 'Canceled', tone: 'neutral' };
  }
}

/** `'just now'`, `'12 min ago'`, `'3 hr ago'`, `'2 days ago'`. */
export function ageLabel(createdAt: string | number, now: number = Date.now()): string {
  const t = typeof createdAt === 'number' ? createdAt : Date.parse(createdAt);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor((now - t) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.floor(hr / 24);
  return d === 1 ? '1 day ago' : `${d} days ago`;
}

// ---------------------------------------------------------------------------
// Office filters
// ---------------------------------------------------------------------------

export type OfficeFilter = 'new' | 'projects' | 'routed' | 'closed';

export const OFFICE_FILTERS: readonly { key: OfficeFilter; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'projects', label: 'Projects' },
  { key: 'routed', label: 'Scheduled/quoted' },
  { key: 'closed', label: 'Closed' },
];

/** Which office filters show this request. A brand-new project is both New and a Project. */
export function inOfficeFilter(r: Pick<ServiceRequestVM, 'kind' | 'status'>, f: OfficeFilter): boolean {
  const closed = CLOSED_STATUSES.includes(r.status);
  switch (f) {
    case 'new':
      return r.status === 'new' || (r.kind === 'photo' && r.status === 'reviewing');
    case 'projects':
      return r.kind === 'project' && !closed;
    case 'routed':
      return r.status === 'scheduled' || r.status === 'quoted';
    case 'closed':
      return closed;
  }
}

/** The project action the office takes next, for a project request. */
export type ProjectStep = 'schedule' | 'estimate' | 'start' | 'finish' | null;

export function nextProjectStep(status: RequestStatus): ProjectStep {
  if (status === 'new' || status === 'reviewing') return 'schedule';
  if (status === 'assessment_scheduled') return 'estimate';
  if (status === 'approved') return 'start';
  if (status === 'in_progress') return 'finish';
  return null;
}

/** Before the client approves, the office may move the assessment or revise the estimate. */
export const canReschedule = (s: RequestStatus) => s === 'assessment_scheduled';
export const canReviseEstimate = (s: RequestStatus) => s === 'estimate_sent';

/** Estimate inputs → numbers, or the error to show (office_update_project's rules and wording). */
export function parseEstimate(lowText: string, highText: string): { low: number; high: number } | { error: string } {
  const clean = (s: string) => Number(s.replace(/[$,\s]/g, ''));
  const low = clean(lowText);
  const high = clean(highText);
  if (!lowText.trim() || !highText.trim() || !Number.isFinite(low) || !Number.isFinite(high)) return { error: 'Enter the low and high estimate.' };
  if (low <= 0 || high <= 0) return { error: 'Enter an estimate above $0.' };
  if (low > high) return { error: "The low estimate can't be more than the high one." };
  if (high >= 10_000_000) return { error: 'Enter an estimate under $10,000,000.' };
  return { low, high };
}
