import type { ReactNode } from 'react';
import { View } from 'react-native';
import { AppExitLink } from '../auth/AppExitLink';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { useConfirmVisit, useCurrentVisit, useMyHome, useRescheduleVisit } from '../../data/homeowner';
import { REQUEST_TASK_KEY, type VisitVM } from '../../data/visits';
import { daysUntilVisit, greeting } from '../../lib/dates';
import { useMode } from '../../lib/mode';
import { STATUS } from '../../theme/tokens';
import { Avatar, Row, Screen } from '../../ui/controls';
import { Display, Eyebrow, LqBadge, LqButton, LqCard, Mono, Txt } from '../../ui/primitives';
import { Pulse } from '../../ui/Pulse';
import { usePalette } from '../../ui/theme';

export default function HomeTab() {
  const { mode } = useMode();
  const live = mode === 'live';
  const my = useMyHome();
  const current = useCurrentVisit();

  const header = (
    <View>
      <Row>
        <Txt size={14} muted>
          {my.data ? `${greeting()}, ${my.data.firstName}` : ''}
        </Txt>
        <AppExitLink label="All apps" />
      </Row>
      <Display size={30} style={{ lineHeight: 32 }}>
        {my.data?.street ?? ''}
      </Display>
    </View>
  );

  const error = my.error ?? current.error;
  if (error && (!my.data || current.data === undefined)) {
    return (
      <Screen bottomInset={110}>
        {header}
        <ErrorState
          message={error}
          onRetry={() => {
            my.refetch();
            current.refetch();
          }}
        />
      </Screen>
    );
  }
  if (!my.data || current.data === undefined) {
    return (
      <Screen bottomInset={110}>
        {header}
        <LoadingState />
      </Screen>
    );
  }
  if (!current.data) {
    return (
      <Screen bottomInset={110}>
        {header}
        <EmptyState
          title="No visits scheduled yet"
          body="Your next visit appears here as soon as it's booked, with the full service list a week ahead and a reminder 48 hours before."
        />
      </Screen>
    );
  }
  return <VisitView header={header} visit={current.data} live={live} />;
}

function VisitView({ header, visit, live }: { header: ReactNode; visit: VisitVM; live: boolean }) {
  const c = usePalette();
  const confirm = useConfirmVisit();
  const reschedule = useRescheduleVisit();
  const tech = visit.tech;
  const status = visit.status;

  const who = tech?.firstName ?? 'Your technician';
  const banner =
    status === 'enroute'
      ? { title: `${who} is on the way`, sub: tech?.van ?? '' }
      : status === 'onsite'
        ? { title: `${who} is on site`, sub: `${visit.doneCount} of ${visit.tasks.length} tasks done` }
        : status === 'done'
          ? { title: 'Visit complete · report ready', sub: 'See photos in Reports' }
          : null;

  const daysOut = daysUntilVisit(visit.windowStart, visit.day);
  // Short labels name the notice, not a send that has not happened. The bar is the status.
  const notices = [
    { t: '7 days', on: visit.notices.d7 || (daysOut != null && daysOut >= 0 && daysOut <= 7) },
    { t: '48 hrs', on: visit.notices.h48 },
    { t: 'Day of', on: status !== 'scheduled' },
  ];

  const done = status === 'done';
  const listSent = visit.notices.d7 || visit.notices.h48 || (daysOut != null && daysOut >= 0 && daysOut <= 7);
  const visitLabel = done ? 'Completed' : visit.confirmed ? 'Confirmed' : listSent ? 'Notice sent' : 'Scheduled';
  // Live: once confirmed (or done) the button is settled; demo keeps its original behavior.
  const confirmDisabled = live && (visit.confirmed || done || confirm.isPending);
  const rescheduleDisabled = status !== 'scheduled' || reschedule.isPending;

  return (
    <Screen bottomInset={110}>
      {header}

      {banner ? (
        <View
          testID="tech-banner"
          style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: c.accent }}
        >
          <Pulse>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accentInk }} />
          </Pulse>
          <View>
            <Txt size={13} weight="700" color={c.accentInk}>
              {banner.title}
            </Txt>
            <Txt size={13} color={c.accentInk} style={{ opacity: 0.85 }}>
              {banner.sub}
            </Txt>
          </View>
        </View>
      ) : null}

      <LqCard>
        <Row>
          <Eyebrow>NEXT VISIT</Eyebrow>
          <LqBadge tone={done || visit.confirmed ? 'forest' : 'slate'}>{visitLabel}</LqBadge>
        </Row>
        <Display size={34} style={{ marginTop: 8 }}>
          {visit.day}
        </Display>
        <Txt size={14} muted style={{ marginTop: 4 }}>
          {visit.time} · about {visit.duration}
        </Txt>
        {tech ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderColor: c.rule }}>
            <Avatar initials={tech.initials} />
            <View>
              <Txt weight="600">{tech.name}</Txt>
              <Txt size={12} muted>
                {tech.title}
              </Txt>
            </View>
          </View>
        ) : null}
        <View style={{ marginTop: 10 }}>
          {visit.tasks.map((t) => (
            <Row key={t.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderColor: c.rule, gap: 10 }}>
              <Txt size={13} style={{ flexShrink: 1 }}>
                {t.name}
              </Txt>
              <Mono size={11} muted>
                {t.key === REQUEST_TASK_KEY ? 'your request' : `${t.min} min`}
              </Mono>
            </Row>
          ))}
        </View>
      </LqCard>

      <View style={{ flexDirection: 'row', gap: 6 }}>
        {notices.map((n) => (
          <View key={n.t} style={{ flex: 1 }}>
            <View style={{ height: 3, borderRadius: 2, backgroundColor: n.on ? STATUS.forest : c.rule, marginBottom: 6 }} />
            <Txt size={13} muted style={{ textAlign: 'center' }}>
              {n.t}
            </Txt>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <LqButton full style={{ flex: 1 }} onPress={() => confirm.mutate(visit.id)} disabled={confirmDisabled}>
          {visit.confirmed ? 'Confirmed ✓' : 'Confirm'}
        </LqButton>
        <LqButton full variant="ghost" style={{ flex: 1 }} onPress={() => reschedule.mutate(visit.id)} disabled={rescheduleDisabled}>
          {reschedule.isPending ? 'Rescheduling…' : 'Reschedule'}
        </LqButton>
      </View>
    </Screen>
  );
}
