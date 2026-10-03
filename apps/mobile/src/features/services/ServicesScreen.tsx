import { money } from '@php/pricing';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { RequestPhotoThumbs, StatusLine } from './ServiceBits';
import { ErrorState, LoadingState } from '../../components/States';
import { useBookBid, useQuoteRequests, useRequestQuote, type QuoteRequestVM } from '../../data/homeowner';
import {
  CANCELABLE,
  SERVICE_LINES,
  ageLabel,
  estimateRange,
  homeownerStatusLine,
  titleRepeatsDescription,
  useApproveEstimate,
  useCancelServiceRequest,
  useMyServiceRequests,
  useServiceCatalog,
  type ServiceCategoryVM,
  type ServiceLine,
  type ServiceRequestVM,
} from '../../data/services';
import { STATUS } from '../../theme/tokens';
import { Pill, Row, Screen, Segmented } from '../../ui/controls';
import { Display, Eyebrow, LqBadge, LqButton, LqCard, LqSectionTitle, Mono, Txt } from '../../ui/primitives';
import { Pulse } from '../../ui/Pulse';
import { usePalette } from '../../ui/theme';

const openShowUs = () => router.push('/homeowner/request');

export default function ServicesTab() {
  const [line, setLine] = useState<ServiceLine>('maintenance');

  return (
    <Screen bottomInset={110}>
      <View>
        <Display>Services</Display>
        <Txt size={14} muted style={{ marginTop: 6, lineHeight: 20 }}>
          Your first stop for anything the house needs. Vetted partners handle routine and seasonal care; bigger projects we manage
          ourselves, under our general contractor's license.
        </Txt>
      </View>
      <ShowUsCard />
      <MyRequests />
      <Segmented options={SERVICE_LINES} value={line} onChange={setLine} testIDPrefix="services-line-" full />
      {line === 'contracted' ? <ContractedList /> : <NetworkLine line={line} />}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Show us
// ---------------------------------------------------------------------------

function ShowUsCard() {
  const c = usePalette();
  return (
    <Pressable testID="show-us-start" onPress={openShowUs} accessibilityRole="button" accessibilityLabel="Show us: something not right? Snap a photo">
      <LqCard strong style={{ gap: 8 }}>
        <Eyebrow accent>SHOW US</Eyebrow>
        <Txt size={17} weight="600">
          Something not right?
        </Txt>
        <Txt size={13} muted style={{ lineHeight: 19 }}>
          Snap a photo and we'll take care of it. A door that sticks, a squeaky floor, a stain on the ceiling: tell us, and we'll send the
          right person.
        </Txt>
        <View style={{ marginTop: 4 }}>
          <Pill label="Snap a photo ›" bg={c.accent} ink={c.accentInk} onPress={openShowUs} />
        </View>
      </LqCard>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Your requests
// ---------------------------------------------------------------------------

function MyRequests() {
  const mine = useMyServiceRequests();
  if (mine.error) return <ErrorState title="We couldn't load your requests" message={mine.error} onRetry={mine.refetch} />;
  if (!mine.data) return <LoadingState label="Loading your requests…" />;
  if (!mine.data.length) return null;
  return (
    <View testID="my-requests" style={{ gap: 10 }}>
      <LqSectionTitle>Your requests</LqSectionTitle>
      {mine.data.map((r) => (
        <RequestCard key={r.id} r={r} />
      ))}
    </View>
  );
}

function RequestCard({ r }: { r: ServiceRequestVM }) {
  const c = usePalette();
  const approve = useApproveEstimate();
  const cancel = useCancelServiceRequest();
  const line = homeownerStatusLine(r);
  const estimate = r.status === 'estimate_sent';
  const approving = approve.isPending && approve.variables === r.id;
  const canceling = cancel.isPending && cancel.variables === r.id;
  const busy = approve.isPending || cancel.isPending;
  const canCancel = CANCELABLE.includes(r.status);
  const eyebrow = r.kind === 'project' ? `PROJECT${r.categoryName ? ' · ' + r.categoryName : ''}` : 'SHOW US';

  return (
    <View testID={`request-${r.id}`}>
      <LqCard style={{ gap: 8 }}>
        <Row style={{ gap: 10 }}>
          <Eyebrow style={{ flexShrink: 1 }}>{eyebrow}</Eyebrow>
          <Mono size={10} muted>
            {ageLabel(r.createdAt)}
          </Mono>
        </Row>
        <Txt size={15} weight="600" numberOfLines={3} style={{ lineHeight: 21 }}>
          {titleRepeatsDescription(r.title, r.description) ? r.description : r.title}
        </Txt>
        <RequestPhotoThumbs photos={r.photos} size={48} />
        <StatusLine text={line.text} tone={line.tone} testID={`request-status-${r.id}`} />
        {estimate ? (
          <>
            <Display size={28} style={{ lineHeight: 30, textTransform: 'none' }}>
              {estimateRange(r.estimateLow, r.estimateHigh)}
            </Display>
            <Txt size={12} muted style={{ lineHeight: 17 }}>
              Your project manager's estimate for labor and materials. Approve it and we'll schedule the work, with clear milestones.
            </Txt>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View testID={`request-approve-${r.id}`} style={{ flex: 1 }}>
                <LqButton onPress={() => approve.mutate(r.id)} disabled={busy}>
                  {approving ? 'Approving…' : 'Approve estimate'}
                </LqButton>
              </View>
              <View testID={`request-cancel-${r.id}`} style={{ flex: 1 }}>
                <LqButton variant="ghost" onPress={() => cancel.mutate(r.id)} disabled={busy}>
                  {canceling ? 'Canceling…' : 'Not now'}
                </LqButton>
              </View>
            </View>
          </>
        ) : canCancel ? (
          <View testID={`request-cancel-${r.id}`} style={{ alignSelf: 'flex-start' }}>
            <LqButton variant="ghost" onPress={() => cancel.mutate(r.id)} disabled={busy} style={{ minHeight: 0, paddingVertical: 6, paddingHorizontal: 12 }}>
              <Txt size={13} weight="500" color={c.muted}>
                {canceling ? 'Canceling…' : 'Cancel request'}
              </Txt>
            </LqButton>
          </View>
        ) : null}
      </LqCard>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Maintenance + Seasonal (network quotes → bids → Book)
// ---------------------------------------------------------------------------

function NetworkLine({ line }: { line: 'maintenance' | 'seasonal' }) {
  const catalog = useServiceCatalog();
  const reqs = useQuoteRequests();
  const error = catalog.error ?? reqs.error;
  if (!catalog.data || !reqs.data) {
    return error ? (
      <ErrorState
        message={error}
        onRetry={() => {
          catalog.refetch();
          reqs.refetch();
        }}
      />
    ) : (
      <LoadingState label="Loading services…" />
    );
  }
  const items = catalog.data.lines[line];
  return (
    <>
      {line === 'seasonal' ? (
        <Txt size={13} muted style={{ lineHeight: 19 }}>
          Booked at the right time of year. What's in season now comes first.
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {items.map((a) => (
          <ServiceTile key={a.id} a={a} reqs={reqs.data!} />
        ))}
      </View>
      <QuoteCards list={reqs.data} />
    </>
  );
}

function ServiceTile({ a, reqs }: { a: ServiceCategoryVM; reqs: QuoteRequestVM[] }) {
  const c = usePalette();
  const requestQuote = useRequestQuote();
  const r = reqs.find((x) => x.category === a.id);
  const asking = !r && requestQuote.isPending && requestQuote.variables === a.id;
  const n = r?.bids.length ?? 0;
  const booked = !!r?.booked;
  const label = asking ? 'Finding pros…' : !r ? 'Get quotes' : booked ? 'Booked ✓' : n ? `${n} quote${n > 1 ? 's' : ''}` : 'Finding pros…';
  const bg = asking ? c.rule : !r ? c.accent : booked ? STATUS.forest : n ? STATUS.slate : c.rule;
  const ink = asking ? c.muted : !r ? c.accentInk : n || booked ? '#fff' : c.muted;
  const season = a.line === 'seasonal' && a.inSeason;
  return (
    <Pressable
      testID={`addon-${a.id}`}
      onPress={() => {
        if (!r) requestQuote.mutate(a.id);
      }}
      disabled={asking}
      accessibilityRole="button"
      accessibilityLabel={`${a.name}${season ? ', in season' : ''}: ${label}`}
      style={{ width: '47%', flexGrow: 1, gap: 8, padding: 12, borderRadius: 18, backgroundColor: c.glassStrong, borderWidth: 1, borderColor: c.rule }}
    >
      {season ? <LqBadge tone="forest">In season</LqBadge> : null}
      <Txt weight="600">{a.name}</Txt>
      <Txt size={11} muted style={{ lineHeight: 14 }}>
        {a.sub}
      </Txt>
      <Pill label={label} bg={bg} ink={ink} />
    </Pressable>
  );
}

function QuoteCards({ list }: { list: QuoteRequestVM[] }) {
  const c = usePalette();
  const book = useBookBid();
  return (
    <>
      {list.map((r) => {
        const collecting = r.bids.length < 3 && !r.booked;
        return (
          <LqCard key={r.id}>
            <Row>
              <Txt weight="600">{r.name}</Txt>
              <Mono size={10} medium muted>
                {r.booked ? 'BOOKED' : `${r.bids.length} OF 3 QUOTES`}
              </Mono>
            </Row>
            {r.bids.map((b) => {
              const bk = r.bookedBidId === b.id;
              const other = r.booked && !bk;
              const booking = book.isPending && book.variables === b.id;
              // While any booking is in flight, every Book pill waits.
              const locked = book.isPending;
              return (
                <View
                  key={b.id}
                  testID={`bid-${b.vendor}`}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: c.rule, marginTop: 6 }}
                >
                  <View style={{ flex: 1 }}>
                    <Txt size={13} weight="600">
                      {b.vendor}
                    </Txt>
                    <Txt size={11} muted>
                      ★ {b.rating} · {b.when}
                    </Txt>
                  </View>
                  <Txt weight="600">{money(b.price)}</Txt>
                  <View style={{ alignSelf: 'flex-start', opacity: locked && !bk && !other ? 0.5 : 1 }} accessibilityState={{ disabled: locked || !!r.booked }}>
                    <Pill
                      label={bk ? 'Booked ✓' : other ? '—' : booking ? 'Booking…' : 'Book'}
                      bg={bk ? STATUS.forest : other ? c.rule : c.accent}
                      ink={bk ? '#fff' : other ? c.muted : c.accentInk}
                      onPress={!r.booked && !locked ? () => book.mutate(b.id) : undefined}
                    />
                  </View>
                </View>
              );
            })}
            {collecting ? (
              <Pulse period={1600}>
                <Txt size={12} muted style={{ marginTop: 8 }}>
                  Asking vetted service partners near you…
                </Txt>
              </Pulse>
            ) : null}
          </LqCard>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Contracted (PHP projects: assessment → estimate → approve)
// ---------------------------------------------------------------------------

function ContractedList() {
  const c = usePalette();
  const catalog = useServiceCatalog();
  if (!catalog.data) {
    return catalog.error ? <ErrorState message={catalog.error} onRetry={catalog.refetch} /> : <LoadingState label="Loading services…" />;
  }
  return (
    <>
      <Txt size={13} muted style={{ lineHeight: 19 }}>
        Done by Premium Home under our general contractor's license. A project manager visits, then sends an estimate with clear
        milestones. Nothing starts until you approve it.
      </Txt>
      <LqCard style={{ padding: 0 }}>
        {catalog.data.lines.contracted.map((s, i) => (
          <Pressable
            key={s.id}
            testID={`contracted-${s.id}`}
            onPress={() => router.push({ pathname: '/homeowner/request', params: { kind: 'project', category: s.id } })}
            accessibilityRole="button"
            accessibilityLabel={`${s.name}: request an assessment`}
          >
            <Row style={{ gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderColor: c.rule }}>
              <View style={{ flex: 1 }}>
                <Txt weight="600">{s.name}</Txt>
                <Txt size={12} muted style={{ lineHeight: 16 }}>
                  {s.sub}
                </Txt>
              </View>
              <Mono size={10} medium accent>
                ASSESS ›
              </Mono>
            </Row>
          </Pressable>
        ))}
      </LqCard>
    </>
  );
}
