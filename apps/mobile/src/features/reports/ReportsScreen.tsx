import { TASKS } from '@php/pricing';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { RemotePhoto } from '../../components/camera/RemotePhoto';
import { ErrorState, LoadingState } from '../../components/States';
import { useCurrentVisit, useReports, type ReportVM } from '../../data/homeowner';
import { PHOTO_GRADIENTS, TECH } from '../../data/seed';
import { useMode } from '../../lib/mode';
import { Row, Screen, TextLink } from '../../ui/controls';
import { Display, LqBadge, LqCard, Txt } from '../../ui/primitives';
import { usePalette } from '../../ui/theme';

export default function ReportsTab() {
  const reports = useReports();
  const [openId, setOpenId] = useState<string | null>(null);

  if (!reports.data) {
    return (
      <Screen bottomInset={110}>
        <Display>Reports</Display>
        {reports.error ? <ErrorState message={reports.error} onRetry={reports.refetch} /> : <LoadingState />}
      </Screen>
    );
  }

  if (!reports.data.length) return <NoReports />;

  const openIndex = openId ? reports.data.findIndex((r) => r.id === openId) : -1;
  const open = openIndex >= 0 ? reports.data[openIndex] : undefined;
  if (!open) {
    return (
      <Screen bottomInset={110}>
        <Display>Reports</Display>
        {reports.data.map((r, i) => (
          <Pressable key={r.id} testID="report-card" onPress={() => setOpenId(r.id)} accessibilityRole="button">
            <LqCard>
              <Row>
                <View>
                  <Txt size={15} weight="600">
                    {r.day} visit
                  </Txt>
                  <Txt size={12} muted>
                    {r.techShort} · {r.photos.length} photos · {r.doneCount} tasks
                  </Txt>
                </View>
                {i === 0 ? <LqBadge tone="forest">New</LqBadge> : null}
              </Row>
            </LqCard>
          </Pressable>
        ))}
      </Screen>
    );
  }

  const previous = reports.data[openIndex + 1];
  return <ReportDetail report={open} previousHealth={previous ? previous.health : null} onBack={() => setOpenId(null)} />;
}

/** Before the first visit is done. */
function NoReports() {
  const { mode } = useMode();
  const live = mode === 'live';
  const current = useCurrentVisit();
  const first = live ? (current.data?.tech?.firstName ?? 'Your technician') : TECH.name.split(' ')[0];
  return (
    <Screen bottomInset={110}>
      <Display>Reports</Display>
      <LqCard>
        <Txt weight="600">Your first report arrives after the visit</Txt>
        <Txt size={13} muted style={{ marginTop: 6, lineHeight: 19 }}>
          {live ? (
            <>{first} photographs every filter, drain and part so you can see the difference.</>
          ) : (
            <>
              {first} photographs every filter, drain and part so you can see the difference. Try it: open the Technician app, start the
              visit and complete the checklist.
            </>
          )}
        </Txt>
      </LqCard>
    </Screen>
  );
}

function healthNote(health: number, previous: number | null): string | undefined {
  if (previous == null) return undefined;
  const delta = health - previous;
  if (delta === 0) return 'No change since your last visit';
  return `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} since your last visit`;
}

function ReportDetail({ report, previousHealth, onBack }: { report: ReportVM; previousHealth: number | null; onBack: () => void }) {
  const c = usePalette();
  const { mode } = useMode();
  const note = healthNote(report.health, previousHealth);
  return (
    <Screen bottomInset={110}>
      <TextLink onPress={onBack}>‹ Reports</TextLink>
      <Row style={{ alignItems: 'flex-end' }}>
        <View>
          <Txt size={13} muted>
            {report.day} · {report.techShort}
          </Txt>
          <Display>Visit report</Display>
        </View>
        <LqBadge tone="forest">{`${report.doneCount} done`}</LqBadge>
      </Row>
      <LqCard style={{ gap: 4 }}>
        <Row>
          <Txt size={12} muted style={{ textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Home health
          </Txt>
          {mode === 'demo' ? <LqBadge tone="slate">Sample</LqBadge> : null}
        </Row>
        <Display size={30} style={{ lineHeight: 30, textTransform: 'none' }}>
          {String(report.health)}
        </Display>
        {note ? (
          <Txt size={12} muted>
            {note}
          </Txt>
        ) : null}
      </LqCard>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {report.photos.length ? (
          report.photos.map((p) => {
            const task = TASKS.find((t) => t.id === p.taskKey);
            return (
              <View key={p.key} style={{ width: '47%', flexGrow: 1, gap: 5 }}>
                <RemotePhoto path={p.path} height={124} radius={14} tag={p.tag} colors={task ? PHOTO_GRADIENTS[task.photo] : undefined} testID="report-photo" />
                <Txt size={12}>{p.taskShort}</Txt>
              </View>
            );
          })
        ) : (
          <View style={{ width: '47%', flexGrow: 1, gap: 5 }}>
            <RemotePhoto path={null} height={124} radius={14} tag="—" caption={null} colors={[c.rule, c.rule]} />
            <Txt size={12}>No photos captured</Txt>
          </View>
        )}
      </View>
      {report.findings.map((f) => (
        <Row key={f.text} style={{ gap: 10 }}>
          <Txt size={13} style={{ flexShrink: 1 }}>
            {f.text}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {f.sample ? <LqBadge tone="slate">Sample</LqBadge> : null}
            {f.badge ? <LqBadge tone={f.tone}>{f.badge}</LqBadge> : null}
          </View>
        </Row>
      ))}
    </Screen>
  );
}
