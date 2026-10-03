import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, View } from 'react-native';
import { RequestPhotoThumbs } from '../services/ServiceBits';
import { EmptyState, ErrorState, LoadingState } from '../../components/States';
import { roomLabel, titleRepeatsDescription, urgencyLabel } from '../../data/servicesModel';
import { stopWhen, useTechVisit, useTechVisitActions } from '../../data/tech';
import { REQUEST_TASK_KEY } from '../../data/visits';
import { STATUS } from '../../theme/tokens';
import { Pill, Row, Screen, TextLink } from '../../ui/controls';
import { Display, Eyebrow, LqBadge, LqButton, LqCard, LqSectionTitle, Mono, Txt } from '../../ui/primitives';
import { usePalette } from '../../ui/theme';

const ADVANCE_LABEL = {
  scheduled: 'Start driving · notify client',
  enroute: 'Mark arrived on site',
  onsite: 'On site · work the checklist',
  done: 'Visit complete',
} as const;

export default function TechJob() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id || undefined;
  const q = useTechVisit(id);
  const visit = q.data ?? undefined;
  const act = useTechVisitActions(visit);
  const c = usePalette();

  const back = <TextLink onPress={() => (router.canGoBack() ? router.back() : router.replace('/tech'))}>‹ Route</TextLink>;

  if (!visit) {
    return (
      <Screen>
        {back}
        {q.error ? (
          <ErrorState message={q.error} onRetry={q.refetch} />
        ) : q.data === null ? (
          <EmptyState title="Visit not found" body="It may have been rescheduled or reassigned. Head back to your route." />
        ) : (
          <LoadingState label="Loading visit…" />
        )}
      </Screen>
    );
  }

  const status = visit.status;
  const onsite = status === 'onsite';
  const active = onsite || status === 'done';
  const allDone = visit.doneCount === visit.tasks.length;

  return (
    <Screen>
      {back}
      <View>
        <Mono size={11} medium accent>
          {stopWhen(visit)} · {visit.tierName}
        </Mono>
        <Display size={30} style={{ lineHeight: 30 }}>
          {visit.client.name}
        </Display>
        <Txt size={13} muted>
          {visit.client.address}
        </Txt>
      </View>
      <LqCard>
        <Eyebrow>NOTES FROM CLIENT</Eyebrow>
        <Txt size={13} style={{ marginTop: 4 }}>
          {visit.client.pets ? '2 friendly dogs — please close the side gate. ' : ''}
          {visit.client.notes || (visit.client.pets ? '' : 'No notes from the client.')}
        </Txt>
      </LqCard>
      <View testID="visit-advance">
        <LqButton full onPress={act.advance} disabled={act.advancing || onsite || status === 'done'}>
          {ADVANCE_LABEL[status]}
        </LqButton>
      </View>
      <Row>
        <LqSectionTitle>Checklist</LqSectionTitle>
        <Mono size={12} medium muted>
          {visit.doneCount} / {visit.tasks.length}
        </Mono>
      </Row>
      {!active ? (
        <Txt size={12} muted>
          Checklist unlocks when you mark yourself on site.
        </Txt>
      ) : null}
      <View style={{ gap: 8 }}>
        {visit.tasks.map((t) => {
          const d = t.done;
          const p = t.photos.length > 0;
          const uploading = act.photoBusy(t.id);
          const locked = !onsite || act.taskBusy(t.id);
          const isRequest = t.key === REQUEST_TASK_KEY;
          const req = t.request;
          return (
            <View
              key={t.id}
              style={{
                flexDirection: 'row',
                alignItems: isRequest ? 'flex-start' : 'center',
                gap: 10,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 16,
                backgroundColor: c.glassStrong,
                borderWidth: 1,
                borderColor: c.rule,
                opacity: active ? 1 : 0.5,
              }}
            >
              <Pressable
                // Several client requests can share a visit, so theirs carry the task id.
                testID={isRequest ? `task-request-${t.id}` : `task-${t.key}`}
                onPress={() => act.toggleTask(t)}
                disabled={locked}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: d, disabled: locked }}
                // react-native-web ignores accessibilityState; aria-checked reaches the DOM (and native).
                aria-checked={d}
                accessibilityLabel={t.name}
                style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: d ? STATUS.forest : c.muted, backgroundColor: d ? STATUS.forest : 'transparent', alignItems: 'center', justifyContent: 'center' }}
              >
                <Txt size={14} color="#fff">
                  {d ? '✓' : ''}
                </Txt>
              </Pressable>
              {isRequest ? (
                <View style={{ flex: 1, gap: 6 }} testID={req ? `client-request-${req.id}` : undefined}>
                  <LqBadge tone="slate">Client request</LqBadge>
                  <Txt size={13} weight="600">
                    {req ? (titleRepeatsDescription(req.title, req.description) ? req.description : req.title) : t.name.replace(/^Client request:\s*/i, '')}
                  </Txt>
                  {req ? (
                    <>
                      {req.description && !titleRepeatsDescription(req.title, req.description) ? (
                        <Txt size={12} muted style={{ lineHeight: 17 }}>
                          {req.description}
                        </Txt>
                      ) : null}
                      <Mono size={10.5} muted>
                        {[roomLabel(req.room), `${urgencyLabel(req.urgency)}`].filter(Boolean).join(' · ')}
                      </Mono>
                      <RequestPhotoThumbs photos={req.photos} size={56} testIDPrefix={`client-request-photo-${req.id}-`} />
                    </>
                  ) : null}
                </View>
              ) : (
                <View style={{ flex: 1 }}>
                  <Txt size={13} weight="600">
                    {t.name}
                  </Txt>
                  <Mono size={10.5} muted>
                    {t.part} · {t.min} min
                  </Mono>
                </View>
              )}
              <View testID={isRequest ? `photo-request-${t.id}` : `photo-${t.key}`} style={{ alignSelf: 'flex-start' }}>
                <Pill
                  label={uploading ? 'Uploading…' : p ? '✓ Photo' : '+ Photo'}
                  bg={p ? STATUS.forest : 'transparent'}
                  ink={p ? '#fff' : c.accent}
                  border={c.rule}
                  onPress={act.canPhoto && !uploading ? () => act.addPhoto(t) : undefined}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View testID="visit-complete">
        <LqButton full onPress={act.complete} disabled={act.completing || !(onsite && allDone)}>
          {status === 'done' ? 'Report sent ✓' : act.completing ? 'Sending report…' : onsite && allDone ? 'Complete & send report' : 'Complete all tasks to finish'}
        </LqButton>
      </View>
    </Screen>
  );
}
