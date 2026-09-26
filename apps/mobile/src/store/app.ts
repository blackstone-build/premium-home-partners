// One shared store for the four roles. In demo mode every role runs on the same
// device, exactly like the connected prototype, so actions in one app show up
// in the others. With Supabase configured these slices are replaced by
// React Query + Realtime over the tables in supabase/migrations.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  DEFAULT_FREQ,
  DEFAULT_MINUTES,
  DEFAULT_SETTINGS,
  type Frequencies,
  type LaborMinutes,
  type Water,
} from '@php/pricing';
import { ADD_ONS, APPLIANCES, MY_VENDOR, OTHER_VENDORS, SERVICE_CATALOG, SLOTS } from '../data/seed';
import {
  CANCELABLE,
  DECLINABLE,
  DESCRIPTION_MAX,
  MAX_REQUEST_PHOTOS,
  ROUTABLE,
  defaultTitle,
  type RequestKind,
  type RequestRoute,
  type RequestStatus,
  type Room,
  type Urgency,
} from '../data/servicesModel';
import { addDays, chicagoTimeToIso, todayChicago } from '../lib/dates';

export type TechStatus = 'scheduled' | 'enroute' | 'onsite' | 'done';

/** A Services v2 request kept on this device (offline demo). Photos stay local URIs, never uploaded. */
export interface LocalServiceRequest {
  id: string;
  /** Asked from this device's homeowner app (Elena), vs. a seeded client's request. */
  mine: boolean;
  client: string;
  street: string;
  kind: RequestKind;
  category: string | null;
  title: string;
  description: string;
  room: Room | null;
  urgency: Urgency;
  status: RequestStatus;
  route: RequestRoute | null;
  /** `'Oct 14'` once routed to a visit. */
  visitLabel: string | null;
  assessmentAt: string | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  officeNote: string | null;
  /** Epoch ms. */
  createdAt: number;
  photos: { id: string; uri: string }[];
}

export interface NewLocalRequest {
  kind: RequestKind;
  category: string | null;
  description: string;
  room: Room | null;
  urgency: Urgency;
  photos: string[];
}

export interface ProjectUpdate {
  status: RequestStatus;
  assessmentAt?: string | null;
  low?: number | null;
  high?: number | null;
  note?: string | null;
}

/** Other clients' next visits in the demo calendar (see useDemoDispatch). */
const DEMO_CLIENT_VISITS: Record<string, string> = {
  'David Okafor': 'Oct 14',
  'The Whitfields': 'Oct 14',
  'Priya Shah': 'Oct 15',
  'Mark & Jo Bell': 'Oct 16',
};

const HOUR = 3_600_000;

/** The seed_demo() requests, relative to now: David's roof, the Whitfields' pool, Priya's back door. */
function seedRequests(now: number = Date.now()): LocalServiceRequest[] {
  const base: Pick<LocalServiceRequest, 'mine' | 'route' | 'visitLabel' | 'assessmentAt' | 'estimateLow' | 'estimateHigh' | 'officeNote' | 'photos'> = {
    mine: false,
    route: null,
    visitLabel: null,
    assessmentAt: null,
    estimateLow: null,
    estimateHigh: null,
    officeNote: null,
    photos: [],
  };
  return [
    {
      ...base,
      id: 'demo-req-david',
      client: 'David Okafor',
      street: '4410 Bryn Mawr Dr',
      kind: 'project',
      category: 'roof',
      title: 'Roof inspection after the last storm',
      description: "We lost a few shingles in the last storm and there's a new stain on the upstairs ceiling.",
      room: 'exterior',
      urgency: 'soon',
      status: 'assessment_scheduled',
      assessmentAt: chicagoTimeToIso(addDays(todayChicago(now), 1), 10),
      createdAt: now - 50 * HOUR,
    },
    {
      ...base,
      id: 'demo-req-whitfield',
      client: 'The Whitfields',
      street: '88 Beverly Dr',
      kind: 'project',
      category: 'pool',
      title: 'Pool resurfacing',
      description: "The plaster is rough and stained along the steps. We'd like it resurfaced before next summer.",
      room: 'exterior',
      urgency: 'whenever',
      status: 'estimate_sent',
      estimateLow: 18500,
      estimateHigh: 22000,
      createdAt: now - 6 * 24 * HOUR,
    },
    {
      ...base,
      id: 'demo-req-priya',
      client: 'Priya Shah',
      street: '17 Stonebridge Dr',
      kind: 'photo',
      category: null,
      title: "Back door sticks and won't latch",
      description: "The back door drags at the top and won't latch unless you lean on it.",
      room: 'kitchen',
      urgency: 'soon',
      status: 'scheduled',
      route: 'visit',
      visitLabel: DEMO_CLIENT_VISITS['Priya Shah'],
      createdAt: now - 20 * HOUR,
    },
  ];
}

export interface Bid {
  vendor: string;
  rating: number;
  when: string;
  price: number;
  mine?: boolean;
}

export interface QuoteRequest {
  id: string;
  name: string;
  sub: string;
  base: number;
  bids: Bid[];
  /** Index into bids of the booked bid. */
  booked: number | null;
}

export interface AppState {
  dark: boolean;
  // Homeowner onboarding
  step: number; // 0 welcome · 1–5 onboarding · 6 onboarded
  name: string;
  addr: string;
  scanned: number;
  scanning: boolean;
  sqft: number;
  year: number;
  beds: number;
  baths: number;
  floors: number;
  zones: number;
  pets: boolean;
  water: Water;
  research: number;
  tier: number;
  // Visit
  slot: number;
  confirmed: boolean;
  tech: TechStatus;
  done: Record<string, boolean>;
  shots: Record<string, boolean>;
  report: boolean;
  reminders: boolean;
  // Office pricing
  rate: number;
  trip: number;
  markup: number;
  techCost: number;
  mins: LaborMinutes;
  freq: Frequencies;
  // Brokerage
  reqs: QuoteRequest[];
  vPrice: Record<string, number>;
  vWhen: number;
  // Services v2: Show us requests and contracted projects
  svc: LocalServiceRequest[];
}

type NumKey = 'sqft' | 'year' | 'beds' | 'baths' | 'floors' | 'zones' | 'rate' | 'trip' | 'markup' | 'techCost';

interface Actions {
  set: (p: Partial<AppState>) => void;
  reset: () => void;
  bump: (k: NumKey, d: number, min: number, max: number) => void;
  goStep: (n: number) => void;
  shutter: () => void;
  techAdvance: () => void;
  toggleTask: (id: string) => void;
  togglePhoto: (id: string) => void;
  completeVisit: () => void;
  setMinutes: (id: string, d: number) => void;
  setFreq: (id: string, tier: number, d: number) => void;
  requestQuote: (addOnId: string) => void;
  book: (reqId: string, bidIndex: number) => void;
  submitBid: (reqId: string, price: number, when: string) => void;
  resumePending: () => void;
  /** Services v2 (offline demo). Each returns an error message written for users, or the result. */
  createServiceRequest: (r: NewLocalRequest) => { id: string } | { error: string };
  routeServiceRequest: (id: string, route: RequestRoute, category: string | null, note: string | null) => string | null;
  updateServiceProject: (id: string, u: ProjectUpdate) => string | null;
  approveEstimate: (id: string) => string | null;
  cancelServiceRequest: (id: string) => string | null;
}

const initial = (): AppState => ({
  dark: false,
  step: 0,
  name: 'Elena Alvarez',
  addr: '12 Linden Court, Mountain Brook, AL 35213',
  scanned: 0,
  scanning: false,
  sqft: 3420,
  year: 2006,
  beds: 4,
  baths: 3.5,
  floors: 2,
  zones: 2,
  pets: true,
  water: 'city_hard',
  research: 0,
  tier: 1,
  slot: 0,
  confirmed: false,
  tech: 'scheduled',
  done: {},
  shots: {},
  report: false,
  reminders: false,
  rate: DEFAULT_SETTINGS.rate,
  trip: DEFAULT_SETTINGS.trip,
  markup: DEFAULT_SETTINGS.markup,
  techCost: DEFAULT_SETTINGS.techCost,
  mins: { ...DEFAULT_MINUTES },
  freq: Object.fromEntries(Object.entries(DEFAULT_FREQ).map(([k, v]) => [k, [...v]])),
  reqs: [],
  vPrice: {},
  vWhen: 0,
  svc: seedRequests(),
});

let svcSeq = 0;

let timers: ReturnType<typeof setTimeout>[] = [];
const clearTimers = () => {
  timers.forEach((t) => {
    clearTimeout(t);
    clearInterval(t);
  });
  timers = [];
};

export const useApp = create<AppState & Actions>()(
  persist(
    (set, get) => {
      const addBid = (id: string, b: Bid) =>
        set((s) => ({ reqs: s.reqs.map((r) => (r.id === id ? { ...r, bids: [...r.bids, b] } : r)) }));

      // Network vendors answer each request a few seconds apart.
      const scheduleNetworkBids = (id: string, base: number) => {
        const have = new Set(get().reqs.find((r) => r.id === id)?.bids.map((b) => b.vendor));
        OTHER_VENDORS.filter((o) => !have.has(o.vendor)).forEach((o, k) =>
          timers.push(
            setTimeout(() => addBid(id, { vendor: o.vendor, rating: o.rating, when: o.when, price: Math.round(base * o.m) }), 1500 + k * 1300),
          ),
        );
      };

      const runResearch = () => {
        if (get().research >= 100) return;
        const iv = setInterval(() => {
          const r = Math.min(100, get().research + 3);
          set({ research: r });
          if (r >= 100) clearInterval(iv);
        }, 90);
        timers.push(iv);
      };

      return {
        ...initial(),
        set: (p) => set(p),
        reset: () => {
          clearTimers();
          set({ ...initial(), dark: get().dark });
        },
        bump: (k, d, min, max) => set((s) => ({ [k]: Math.max(min, Math.min(max, +(s[k] + d).toFixed(1))) }) as Partial<AppState>),
        goStep: (n) => {
          set({ step: n });
          if (n === 4) runResearch();
        },
        shutter: () => {
          const s = get();
          if (s.scanning || s.scanned >= APPLIANCES.length) return;
          set({ scanning: true });
          timers.push(setTimeout(() => set((x) => ({ scanning: false, scanned: x.scanned + 1 })), 1100));
        },
        techAdvance: () => set((s) => ({ tech: s.tech === 'scheduled' ? 'enroute' : 'onsite' })),
        toggleTask: (id) => set((s) => (s.tech === 'onsite' ? { done: { ...s.done, [id]: !s.done[id] } } : {})),
        togglePhoto: (id) => set((s) => (s.tech === 'onsite' ? { shots: { ...s.shots, [id]: !s.shots[id] } } : {})),
        completeVisit: () => set({ tech: 'done', report: true }),
        setMinutes: (id, d) => set((s) => ({ mins: { ...s.mins, [id]: Math.max(5, (s.mins[id] ?? 0) + d) } })),
        setFreq: (id, tier, d) =>
          set((s) => {
            const a = [...s.freq[id]];
            a[tier] = Math.max(0, Math.min(12, a[tier] + d));
            return { freq: { ...s.freq, [id]: a } };
          }),
        requestQuote: (addOnId) => {
          const a = ADD_ONS.find((x) => x.id === addOnId);
          if (!a || get().reqs.some((r) => r.id === a.id)) return;
          set((s) => ({
            reqs: [...s.reqs, { id: a.id, name: a.name, sub: a.sub, base: a.base, bids: [], booked: null }],
            vPrice: { ...s.vPrice, [a.id]: a.base },
          }));
          scheduleNetworkBids(a.id, a.base);
        },
        book: (reqId, j) =>
          set((s) => ({ reqs: s.reqs.map((r) => (r.id === reqId && r.booked == null ? { ...r, booked: j } : r)) })),
        submitBid: (reqId, price, when) => addBid(reqId, { ...MY_VENDOR, when, price, mine: true }),
        // --- Services v2, the same rules as the RPCs (docs/SERVICES_V2.md) ---
        createServiceRequest: (r) => {
          const description = r.description.trim();
          const cat = r.category ? SERVICE_CATALOG.find((c) => c.id === r.category) : undefined;
          if (r.category && !cat) return { error: "That service isn't available yet." };
          if (r.kind === 'project' && !cat) return { error: 'Pick a service for this project.' };
          if (r.kind === 'project' && cat?.handledBy !== 'php') return { error: 'Get quotes for this service instead.' };
          if (!description) return { error: "Tell us what's going on." };
          if (description.length > DESCRIPTION_MAX) return { error: 'Keep the description to 1,000 characters or fewer.' };
          if (r.photos.length > MAX_REQUEST_PHOTOS) return { error: 'You can add up to 4 photos.' };
          const s = get();
          const id = `local-${Date.now().toString(36)}-${++svcSeq}`;
          const req: LocalServiceRequest = {
            id,
            mine: true,
            client: s.name,
            street: s.addr.split(',')[0] ?? '',
            kind: r.kind,
            category: cat?.id ?? null,
            title: defaultTitle(cat?.name ?? null, description),
            description,
            room: r.room,
            urgency: r.urgency,
            status: 'new',
            route: null,
            visitLabel: null,
            assessmentAt: null,
            estimateLow: null,
            estimateHigh: null,
            officeNote: null,
            createdAt: Date.now(),
            photos: r.photos.slice(0, MAX_REQUEST_PHOTOS).map((uri, i) => ({ id: `${id}-p${i}`, uri })),
          };
          set({ svc: [req, ...s.svc] });
          return { id };
        },
        routeServiceRequest: (id, route, category, note) => {
          const s = get();
          const r = s.svc.find((x) => x.id === id);
          if (!r) return "We couldn't find that request.";
          if (!ROUTABLE.includes(r.status)) return r.status === 'canceled' ? 'The client canceled this request.' : 'This request was already handled.';
          // A category given here wins; otherwise the request's own is used.
          const catId = category ?? r.category;
          const cat = catId ? SERVICE_CATALOG.find((c) => c.id === catId) : undefined;
          if (catId && !cat) return "That service isn't available yet.";
          let patch: Partial<LocalServiceRequest>;
          if (route === 'visit') {
            const day = r.mine ? (s.tech === 'done' ? null : (SLOTS[s.slot][0].split(' · ')[1] ?? null)) : (DEMO_CLIENT_VISITS[r.client] ?? null);
            if (!day) return "There's no visit scheduled for this home.";
            patch = { status: 'scheduled', route, visitLabel: day, category: cat?.id ?? null };
          } else if (route === 'quotes') {
            if (!cat || cat.handledBy !== 'network') return 'Pick a partner service for quotes.';
            // Only this device's homeowner has quote requests in the demo store.
            if (r.mine) get().requestQuote(cat.id);
            patch = { status: 'quoted', route, category: cat.id };
          } else if (route === 'project') {
            if (!cat || cat.handledBy !== 'php') return 'Pick a Premium Home service for the project.';
            patch = { status: 'reviewing', route, kind: 'project', category: cat.id };
          } else {
            if (!note?.trim()) return 'Add a reply for the client.';
            patch = { status: 'closed', route, category: cat?.id ?? null };
          }
          if (note?.trim()) patch.officeNote = note.trim();
          set({ svc: get().svc.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
          return null;
        },
        updateServiceProject: (id, u) => {
          const r = get().svc.find((x) => x.id === id);
          if (!r) return "We couldn't find that request.";
          if (r.kind !== 'project') return "This request isn't a project.";
          const note = u.note?.trim() || null;
          const closed: Partial<Record<RequestStatus, string>> = {
            done: 'This project is already done.',
            declined: 'This project was declined.',
            canceled: 'The client canceled this request.',
            closed: 'This request is closed.',
          };
          if (closed[r.status]) return r.status === u.status ? null : closed[r.status]!;
          let patch: Partial<LocalServiceRequest>;
          if (u.status === 'approved') {
            return 'Only the client can approve the estimate.';
          } else if (u.status === 'assessment_scheduled') {
            // Includes a reschedule (assessment_scheduled → assessment_scheduled).
            if (!['new', 'reviewing', 'assessment_scheduled'].includes(r.status)) return 'This project is past that step.';
            if (!u.assessmentAt) return 'Pick a date and time for the assessment.';
            patch = { status: u.status, assessmentAt: u.assessmentAt };
          } else if (u.status === 'estimate_sent') {
            // Includes a revised estimate (estimate_sent → estimate_sent).
            if (!['new', 'reviewing', 'assessment_scheduled', 'estimate_sent'].includes(r.status)) return 'This project is past that step.';
            if (u.low == null || u.high == null) return 'Enter the low and high estimate.';
            if (!(u.low > 0) || !(u.high > 0)) return 'Enter an estimate above $0.';
            if (u.low > u.high) return "The low estimate can't be more than the high one.";
            patch = { status: u.status, estimateLow: u.low, estimateHigh: u.high };
          } else if (u.status === 'in_progress') {
            if (r.status === 'in_progress') return null;
            if (r.status !== 'approved') return 'Start work once the client approves the estimate.';
            patch = { status: u.status };
          } else if (u.status === 'done') {
            if (r.status !== 'in_progress') return 'Start work before marking the project done.';
            patch = { status: u.status };
          } else if (u.status === 'declined' && DECLINABLE.includes(r.status)) {
            if (!note) return 'Add a note for the client.';
            patch = { status: u.status };
          } else {
            return "That project status isn't supported.";
          }
          if (note) patch.officeNote = note;
          set({ svc: get().svc.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
          return null;
        },
        approveEstimate: (id) => {
          const r = get().svc.find((x) => x.id === id);
          if (!r) return "We couldn't find that request.";
          if (r.status === 'approved') return null;
          if (r.status !== 'estimate_sent') return "There's no estimate waiting for your approval.";
          set({ svc: get().svc.map((x) => (x.id === id ? { ...x, status: 'approved' } : x)) });
          return null;
        },
        cancelServiceRequest: (id) => {
          const r = get().svc.find((x) => x.id === id);
          if (!r) return "We couldn't find that request.";
          if (r.status === 'canceled') return null;
          if (!CANCELABLE.includes(r.status)) return "This request can't be canceled now.";
          set({ svc: get().svc.map((x) => (x.id === id ? { ...x, status: 'canceled' } : x)) });
          return null;
        },
        resumePending: () => {
          const s = get();
          if (s.step === 4 && s.research < 100) runResearch();
          s.reqs.filter((r) => r.booked == null).forEach((r) => scheduleNetworkBids(r.id, r.base));
        },
      };
    },
    {
      name: 'php-demo-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Transient UI (scan in flight) is never restored.
      partialize: ({ scanning, ...rest }) => rest,
      onRehydrateStorage: () => (s) => {
        // Resume timers (research run, incoming bids) interrupted by a reload.
        s?.resumePending();
      },
    },
  ),
);
