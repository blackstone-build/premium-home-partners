// Office · Requests: every Show us request and contracted project, live.
// New requests get routed (next visit, partner quotes, a project, or a reply);
// projects move through assessment → estimate → approval → work → done.

import { useMemo, useState } from 'react';
import { TextInput, useWindowDimensions, View } from 'react-native';
import { ChoiceChips, RequestPhotoThumbs } from '../services/ServiceBits';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import {
  CONTRACTED_CATEGORIES,
  DECLINABLE,
  NETWORK_CATEGORIES,
  OFFICE_FILTERS,
  ROUTABLE,
  STATUS_LABEL,
  ageLabel,
  canReschedule,
  canReviseEstimate,
  estimateRange,
  inOfficeFilter,
  monthDay,
  nextProjectStep,
  parseEstimate,
  roomLabel,
  titleRepeatsDescription,
  urgencyLabel,
  whenLabel,
  type OfficeFilter,
  type ServiceRequestVM,
} from '../../data/servicesModel';
import { useOfficeRequests, useRouteRequest, useUpdateProject } from '../../data/officeRequests';
import { addDays, chicagoTimeToIso, fmtShortDate, todayChicago, wallClock } from '../../lib/dates';
import { Row } from '../../ui/controls';
import { Display, Eyebrow, LqBadge, LqButton, LqCard, Mono, Txt } from '../../ui/primitives';
import { usePalette } from '../../ui/theme';

export default function OfficeRequests() {
  const q = useOfficeRequests();
  const [filter, setFilter] = useState<OfficeFilter>('new');
  const { width } = useWindowDimensions();
  const two = width >= 1200;
  const data = q.data;
  const rows = useMemo(() => (data ? data.rows.filter((r) => inOfficeFilter(r, filter)) : []), [data, filter]);

  return (
    <>
      <View testID="office-requests">
        <Mono size={11} medium tracking={0.08} muted>
          CLIENT REQUESTS · {data ? `${data.counts.new} NEW` : '—'}
        </Mono>
        <Display size={32} style={{ lineHeight: 32 }}>
          Requests
        </Display>
      </View>
      <ChoiceChips
        options={OFFICE_FILTERS.map((f) => ({ key: f.key, label: data && data.counts[f.key] ? `${f.label} · ${data.counts[f.key]}` : f.label }))}
        value={filter}
        onChange={setFilter}
        testIDPrefix="requests-filter-"
      />
      {!data ? (
        q.error ? (
          <ErrorState message={q.error} onRetry={q.refetch} />
        ) : (
          <LoadingState label="Loading requests…" />
        )
      ) : !rows.length ? (
        <EmptyState title={EMPTY[filter].title} body={EMPTY[filter].body} />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
          {rows.map((r) => (
            <View key={r.id} testID={`office-request-${r.id}`} style={{ width: two ? '49%' : '100%' }}>
              <RequestCard r={r} />
            </View>
          ))}
        </View>
      )}
      <Txt size={12} muted style={{ lineHeight: 18 }}>
        Show us requests come straight from the homeowner app with the client's photos. Add one to the next visit, send it to vetted partners
        for quotes, make it a contracted project, or reply with advice. Clients see every step live.
      </Txt>
    </>
  );
}

const EMPTY: Record<OfficeFilter, { title: string; body: string }> = {
  new: { title: 'No new requests', body: "Show us requests land here the moment a client sends one, photos and all." },
  projects: { title: 'No open projects', body: 'Contracted work (roofs, pools, cabinets) shows up here from request to done.' },
  routed: { title: 'Nothing scheduled or quoted', body: 'Requests you add to a visit or send to partners for quotes show up here.' },
  closed: { title: 'Nothing closed yet', body: 'Replied, finished, declined and canceled requests end up here.' },
};

// ---------------------------------------------------------------------------
// One request
// ---------------------------------------------------------------------------

function detailLine(r: ServiceRequestVM): string | null {
  switch (r.status) {
    case 'scheduled': {
      const day = r.visitStart ? monthDay(r.visitStart) : r.visitLabel;
      return day ? `On the ${day} visit` : 'On the next visit';
    }
    case 'quoted':
      return r.categoryName ? `Partners quoting · ${r.categoryName}` : 'Partners quoting';
    case 'assessment_scheduled':
      return r.assessmentAt ? `Assessment · ${whenLabel(r.assessmentAt)}` : null;
    case 'estimate_sent':
      return `Estimate ${estimateRange(r.estimateLow, r.estimateHigh)} · waiting on the client`;
    case 'approved':
      return `Approved · ${estimateRange(r.estimateLow, r.estimateHigh)} · ready to start`;
    case 'in_progress':
    case 'done':
      return r.estimateLow != null ? `Estimate ${estimateRange(r.estimateLow, r.estimateHigh)}` : null;
    case 'closed':
    case 'declined':
      return r.officeNote ? `Note: ${r.officeNote}` : null;
    default:
      return null;
  }
}

function RequestCard({ r }: { r: ServiceRequestVM }) {
  const c = usePalette();
  const st = STATUS_LABEL[r.status];
  const room = roomLabel(r.room);
  const urgent = r.urgency === 'urgent';
  const detail = detailLine(r);
  const routable = r.kind === 'photo' && ROUTABLE.includes(r.status);
  const project = r.kind === 'project' && (nextProjectStep(r.status) !== null || DECLINABLE.includes(r.status));

  return (
    <LqCard style={{ gap: 10 }}>
      <Row style={{ gap: 10, alignItems: 'flex-start' }}>
        <View style={{ flexShrink: 1 }}>
          <Txt weight="600">{r.client?.name ?? 'Client'}</Txt>
          <Mono size={11} muted>
            {[r.client?.street, room, ageLabel(r.createdAt)].filter(Boolean).join(' · ')}
          </Mono>
        </View>
        <LqBadge tone={st.tone}>{st.label}</LqBadge>
      </Row>
      <View style={{ gap: 4 }}>
        <Row style={{ justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          <Eyebrow accent>{r.kind === 'project' ? `PROJECT${r.categoryName ? ' · ' + r.categoryName : ''}` : 'SHOW US'}</Eyebrow>
          <Mono size={10} medium color={urgent ? c.status.brick : r.urgency === 'soon' ? c.status.ochre : c.muted}>
            {urgencyLabel(r.urgency).toUpperCase()}
          </Mono>
        </Row>
        {titleRepeatsDescription(r.title, r.description) ? (
          // The server titled it from the description: show the client's words once.
          <Txt size={15} weight="600" style={{ lineHeight: 21 }}>
            {r.description}
          </Txt>
        ) : (
          <>
            <Txt size={15} weight="600">
              {r.title}
            </Txt>
            {r.description ? (
              <Txt size={13} muted style={{ lineHeight: 19 }}>
                {r.description}
              </Txt>
            ) : null}
          </>
        )}
      </View>
      <RequestPhotoThumbs photos={r.photos} size={72} testIDPrefix={`office-request-photo-${r.id}-`} />
      {detail ? (
        <Txt size={13} weight="600" color={r.status === 'declined' ? c.status.brick : c.ink}>
          {detail}
        </Txt>
      ) : null}
      {routable ? <RouteActions r={r} /> : null}
      {project ? <ProjectActions r={r} /> : null}
    </LqCard>
  );
}

// ---------------------------------------------------------------------------
// Routing a new Show us request
// ---------------------------------------------------------------------------

type RoutePanel = null | 'quotes' | 'project' | 'advice';

function RouteActions({ r }: { r: ServiceRequestVM }) {
  const c = usePalette();
  const route = useRouteRequest();
  const [panel, setPanel] = useState<RoutePanel>(null);
  const [cat, setCat] = useState<string | null>(r.category);
  const [note, setNote] = useState('');
  const busy = route.pending;
  const mine = busy && route.variables?.id === r.id;

  const open = (p: RoutePanel) => {
    setPanel((cur) => (cur === p ? null : p));
    const pool = p === 'quotes' ? NETWORK_CATEGORIES : p === 'project' ? CONTRACTED_CATEGORIES : [];
    setCat((cur) => (cur && pool.some((x) => x.id === cur) ? cur : null));
  };

  const go = (routeKey: 'visit' | 'quotes' | 'project' | 'advice') =>
    void route.run({ id: r.id, route: routeKey, category: routeKey === 'quotes' || routeKey === 'project' ? cat : null, note: routeKey === 'advice' ? note : null });

  return (
    <View style={{ gap: 10, paddingTop: 10, borderTopWidth: 1, borderColor: c.rule }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View testID={`request-route-visit-${r.id}`}>
          <LqButton onPress={() => go('visit')} disabled={busy}>
            {mine && route.variables?.route === 'visit' ? 'Adding…' : 'Add to next visit'}
          </LqButton>
        </View>
        <View testID={`request-route-quotes-${r.id}`}>
          <LqButton variant="ghost" onPress={() => open('quotes')} disabled={busy}>
            Get partner quotes
          </LqButton>
        </View>
        <View testID={`request-route-project-${r.id}`}>
          <LqButton variant="ghost" onPress={() => open('project')} disabled={busy}>
            Start a project
          </LqButton>
        </View>
        <View testID={`request-reply-${r.id}`}>
          <LqButton variant="ghost" onPress={() => open('advice')} disabled={busy}>
            Reply & close
          </LqButton>
        </View>
      </View>
      {panel === 'quotes' || panel === 'project' ? (
        <View style={{ gap: 8 }}>
          <Eyebrow>{panel === 'quotes' ? 'PARTNER SERVICE' : 'CONTRACTED SERVICE'}</Eyebrow>
          <ChoiceChips
            options={(panel === 'quotes' ? NETWORK_CATEGORIES : CONTRACTED_CATEGORIES).map((x) => ({ key: x.id, label: x.name }))}
            value={cat}
            onChange={setCat}
            testIDPrefix={`request-category-${r.id}-`}
          />
          <View testID={`request-confirm-${r.id}`} style={{ alignSelf: 'flex-start' }}>
            <LqButton onPress={() => go(panel)} disabled={busy || !cat}>
              {mine ? 'Sending…' : panel === 'quotes' ? 'Send to partners' : 'Start project'}
            </LqButton>
          </View>
        </View>
      ) : null}
      {panel === 'advice' ? (
        <View style={{ gap: 8 }}>
          <NoteInput testID={`request-note-${r.id}`} value={note} onChange={setNote} placeholder="e.g. That squeak is a loose subfloor board. We'll fix it at your next visit, no charge." />
          <View testID={`request-confirm-${r.id}`} style={{ alignSelf: 'flex-start' }}>
            <LqButton onPress={() => go('advice')} disabled={busy || !note.trim()}>
              {mine ? 'Sending…' : 'Send reply & close'}
            </LqButton>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Moving a project along
// ---------------------------------------------------------------------------

const TIMES = [
  { key: '8', label: '8:00 AM' },
  { key: '10', label: '10:00 AM' },
  { key: '13', label: '1:00 PM' },
  { key: '15', label: '3:00 PM' },
] as const;

/** The next six weekdays after today (Chicago). */
function assessmentDays(today: string = todayChicago()): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let n = 1; out.length < 6 && n < 14; n++) {
    const d = addDays(today, n);
    const wd = wallClock(d).wd;
    if (wd === 0 || wd === 6) continue;
    out.push({ key: d, label: n === 1 ? 'Tomorrow' : fmtShortDate(d) });
  }
  return out;
}

type ProjectPanel = null | 'schedule' | 'estimate' | 'decline';

function ProjectActions({ r }: { r: ServiceRequestVM }) {
  const c = usePalette();
  const update = useUpdateProject();
  const step = nextProjectStep(r.status);
  const [panel, setPanel] = useState<ProjectPanel>(null);
  const days = useMemo(() => assessmentDays(), []);
  const [day, setDay] = useState<string | null>(days[0]?.key ?? null);
  const [hour, setHour] = useState<(typeof TIMES)[number]['key'] | null>('10');
  const [low, setLow] = useState('');
  const [high, setHigh] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const busy = update.pending;
  const mine = busy && update.variables?.id === r.id;
  const declinable = DECLINABLE.includes(r.status);

  const toggle = (p: ProjectPanel) => {
    setErr(null);
    setPanel((cur) => (cur === p ? null : p));
    // Revising or rescheduling starts from what the client has now.
    if (p === 'estimate' && r.estimateLow != null && r.estimateHigh != null) {
      setLow(String(r.estimateLow));
      setHigh(String(r.estimateHigh));
    }
    if (p === 'schedule' && r.assessmentAt) {
      const w = wallClock(r.assessmentAt);
      const ymd = `${w.y}-${String(w.m).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
      if (days.some((d) => d.key === ymd)) setDay(ymd);
      const t = TIMES.find((x) => Number(x.key) === w.h && w.mi === 0);
      if (t) setHour(t.key);
    }
  };
  const run = (args: Parameters<typeof update.run>[0]) =>
    void update.run(args).then((ok) => {
      if (ok) setPanel(null);
    });

  const confirm = () => {
    setErr(null);
    if (panel === 'schedule') {
      if (!day || !hour) return setErr('Choose a day and a time.');
      run({ id: r.id, status: 'assessment_scheduled', assessmentAt: chicagoTimeToIso(day, Number(hour)) });
    } else if (panel === 'estimate') {
      const e = parseEstimate(low, high);
      if ('error' in e) return setErr(e.error);
      run({ id: r.id, status: 'estimate_sent', low: e.low, high: e.high });
    } else if (panel === 'decline') {
      if (!note.trim()) return setErr('Add a note for the client.');
      run({ id: r.id, status: 'declined', note });
    }
  };

  const inputStyle = { flex: 1, minWidth: 0, padding: 12, borderRadius: 14, backgroundColor: c.glassStrong, borderWidth: 1, borderColor: c.rule, fontSize: 15, color: c.ink } as const;

  return (
    <View style={{ gap: 10, paddingTop: 10, borderTopWidth: 1, borderColor: c.rule }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {step === 'schedule' ? (
          <View testID={`request-schedule-${r.id}`}>
            <LqButton onPress={() => toggle('schedule')} disabled={busy}>
              Schedule assessment
            </LqButton>
          </View>
        ) : null}
        {step === 'estimate' ? (
          <View testID={`request-estimate-${r.id}`}>
            <LqButton onPress={() => toggle('estimate')} disabled={busy}>
              Send estimate
            </LqButton>
          </View>
        ) : null}
        {canReschedule(r.status) ? (
          <View testID={`request-schedule-${r.id}`}>
            <LqButton variant="ghost" onPress={() => toggle('schedule')} disabled={busy}>
              Reschedule
            </LqButton>
          </View>
        ) : null}
        {canReviseEstimate(r.status) ? (
          <View testID={`request-estimate-${r.id}`}>
            <LqButton variant="ghost" onPress={() => toggle('estimate')} disabled={busy}>
              Revise estimate
            </LqButton>
          </View>
        ) : null}
        {step === 'start' ? (
          <View testID={`request-start-${r.id}`}>
            <LqButton onPress={() => run({ id: r.id, status: 'in_progress' })} disabled={busy}>
              {mine ? 'Starting…' : 'Start work'}
            </LqButton>
          </View>
        ) : null}
        {step === 'finish' ? (
          <View testID={`request-done-${r.id}`}>
            <LqButton onPress={() => run({ id: r.id, status: 'done' })} disabled={busy}>
              {mine ? 'Saving…' : 'Mark done'}
            </LqButton>
          </View>
        ) : null}
        {declinable ? (
          <View testID={`request-decline-${r.id}`}>
            <LqButton variant="ghost" onPress={() => toggle('decline')} disabled={busy}>
              Decline
            </LqButton>
          </View>
        ) : null}
      </View>
      {r.status === 'estimate_sent' ? (
        <Txt size={12} muted>
          The client approves the estimate from their Services tab.
        </Txt>
      ) : null}

      {panel === 'schedule' ? (
        <View style={{ gap: 8 }}>
          <Eyebrow>ASSESSMENT DAY</Eyebrow>
          <ChoiceChips options={days} value={day} onChange={setDay} testIDPrefix={`request-day-${r.id}-`} />
          <Eyebrow>TIME</Eyebrow>
          <ChoiceChips options={TIMES} value={hour} onChange={setHour} testIDPrefix={`request-time-${r.id}-`} />
        </View>
      ) : null}
      {panel === 'estimate' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Eyebrow>LOW</Eyebrow>
            <TextInput testID={`request-low-${r.id}`} value={low} onChangeText={setLow} keyboardType="numeric" placeholder="$4,200" placeholderTextColor={c.muted} accessibilityLabel="Estimate low" style={inputStyle} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Eyebrow>HIGH</Eyebrow>
            <TextInput testID={`request-high-${r.id}`} value={high} onChangeText={setHigh} keyboardType="numeric" placeholder="$5,600" placeholderTextColor={c.muted} accessibilityLabel="Estimate high" style={inputStyle} />
          </View>
        </View>
      ) : null}
      {panel === 'decline' ? <NoteInput testID={`request-note-${r.id}`} value={note} onChange={setNote} placeholder="Why we can't take it on, and who we'd suggest." /> : null}
      {err ? (
        <Txt testID={`request-action-error-${r.id}`} size={13} color={c.status.brick} accessibilityRole="alert">
          {err}
        </Txt>
      ) : null}
      {panel ? (
        <View testID={`request-confirm-${r.id}`} style={{ alignSelf: 'flex-start' }}>
          <LqButton onPress={confirm} disabled={busy}>
            {mine
              ? 'Saving…'
              : panel === 'schedule'
                ? day && hour
                  ? `Schedule · ${days.find((d) => d.key === day)?.label ?? ''} ${TIMES.find((t) => t.key === hour)?.label ?? ''}`
                  : 'Schedule'
                : panel === 'estimate'
                  ? canReviseEstimate(r.status)
                    ? 'Send revised estimate'
                    : 'Send estimate'
                  : 'Decline request'}
          </LqButton>
        </View>
      ) : null}
    </View>
  );
}

function NoteInput({ value, onChange, placeholder, testID }: { value: string; onChange: (v: string) => void; placeholder: string; testID: string }) {
  const c = usePalette();
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChange}
      multiline
      maxLength={500}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      accessibilityLabel="Note for the client"
      textAlignVertical="top"
      style={{ minHeight: 76, padding: 12, borderRadius: 14, backgroundColor: c.glassStrong, borderWidth: 1, borderColor: c.rule, fontSize: 15, lineHeight: 21, color: c.ink }}
    />
  );
}
