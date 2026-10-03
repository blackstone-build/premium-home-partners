// "Show us" and "Request an assessment": up to four photos, what's going on,
// where in the home and how soon. The request row is created first; photos
// upload after it (a failed upload keeps the request and toasts Retry).

import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { usePhotoCapture } from '../../components/camera';
import { ChoiceChips } from '../../components/ServiceBits';
import {
  CONTRACTED_CATEGORIES,
  DESCRIPTION_MAX,
  MAX_REQUEST_PHOTOS,
  ROOMS,
  URGENCIES,
  useCreateServiceRequest,
  type RequestKind,
  type Room,
  type Urgency,
} from '../../data/services';
import { friendlyError } from '../../lib/errors';
import type { CapturedPhoto } from '../../lib/photos';
import { toast } from '../../lib/toast';
import { Row, Screen, Segmented, TextLink } from '../../ui/controls';
import { Display, Eyebrow, LqButton, LqCard, Mono, Txt } from '../../ui/primitives';
import { usePalette } from '../../ui/theme';

const TILE = 76;

const first = (x: string | string[] | undefined) => (Array.isArray(x) ? x[0] : x) || undefined;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/homeowner/services');
}

export default function RequestScreen() {
  const params = useLocalSearchParams<{ kind?: string | string[]; category?: string | string[] }>();
  const kind: RequestKind = first(params.kind) === 'project' ? 'project' : 'photo';
  const given = CONTRACTED_CATEGORIES.find((x) => x.id === first(params.category));
  const c = usePalette();
  const { capture } = usePhotoCapture();
  const create = useCreateServiceRequest();

  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [picking, setPicking] = useState(false);
  const [description, setDescription] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [urgency, setUrgency] = useState<Urgency>(kind === 'project' ? 'whenever' : 'soon');
  const [category, setCategory] = useState<string | null>(given?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  const project = kind === 'project';
  const catName = CONTRACTED_CATEGORIES.find((x) => x.id === category)?.name ?? null;
  const full = photos.length >= MAX_REQUEST_PHOTOS;
  const busy = create.isPending;
  const ready = !!description.trim() && (!project || !!category);

  const addPhoto = () => {
    if (full || picking || busy) return;
    setError(null);
    let picked: Promise<CapturedPhoto | null>;
    try {
      // No await before this: on web the file picker has to open inside the tap.
      picked = capture({ title: project ? 'Request an assessment' : 'Show us' });
    } catch (e) {
      setError(friendlyError(e));
      return;
    }
    setPicking(true);
    picked
      .then((p) => {
        if (p) setPhotos((xs) => (xs.length >= MAX_REQUEST_PHOTOS ? xs : [...xs, p]));
      })
      .catch((e) => setError(friendlyError(e)))
      .finally(() => setPicking(false));
  };

  const submit = () => {
    if (busy) return;
    if (!description.trim()) {
      setError("Tell us what's going on.");
      return;
    }
    if (project && !category) {
      setError('Choose the kind of project.');
      return;
    }
    setError(null);
    create
      .submit({ kind, category: project ? category : null, description, room, urgency, photos })
      .then((res) => {
        // A photo that didn't upload already has its own toast with Retry.
        if (!res.failedPhotos) toast(project ? "Sent. We'll call to set up the assessment." : "Sent. We'll take it from here.", 'forest');
        goBack();
      })
      .catch((e) => setError(friendlyError(e)));
  };

  return (
    <Screen>
      <TextLink onPress={goBack}>‹ Services</TextLink>
      <View>
        <Eyebrow accent>{project ? 'CONTRACTED PROJECT' : 'SOMETHING NOT RIGHT?'}</Eyebrow>
        <Display size={30} style={{ lineHeight: 32, marginTop: 4 }}>
          {project ? `Request an assessment${catName ? ' · ' + catName : ''}` : 'Show us'}
        </Display>
        <Txt size={14} muted style={{ marginTop: 6, lineHeight: 20 }}>
          {project
            ? "A Premium Home project manager visits to see the work, then sends you an estimate with a clear range. Nothing starts until you approve it."
            : "Snap a photo of anything that isn't right, from a sticky door to a squeaky floor. We'll look at it and send the right person."}
        </Txt>
      </View>

      {project && !given ? (
        <View style={{ gap: 8 }}>
          <Eyebrow>WHAT KIND OF PROJECT</Eyebrow>
          <ChoiceChips
            options={CONTRACTED_CATEGORIES.map((x) => ({ key: x.id, label: x.name }))}
            value={category}
            onChange={setCategory}
            testIDPrefix="request-category-"
          />
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Row>
          <Eyebrow>PHOTOS</Eyebrow>
          <Mono size={10} muted>
            {photos.length} OF {MAX_REQUEST_PHOTOS}
          </Mono>
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((p, i) => (
            <View key={`${i}-${p.uri.slice(-24)}`} style={{ width: TILE, height: TILE, borderRadius: 14, overflow: 'hidden', backgroundColor: c.rule }}>
              <Image testID={`request-photo-${i}`} source={{ uri: p.uri }} resizeMode="cover" style={StyleSheet.absoluteFill} accessibilityLabel={`Photo ${i + 1}`} />
              <Pressable
                testID={`request-photo-remove-${i}`}
                onPress={() => setPhotos((xs) => xs.filter((_, j) => j !== i))}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${i + 1}`}
                hitSlop={6}
                style={{ position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: c.glassStrong, alignItems: 'center', justifyContent: 'center' }}
              >
                <Txt size={13} weight="600">
                  ×
                </Txt>
              </Pressable>
            </View>
          ))}
          {!full ? (
            <Pressable
              testID="request-photo-add"
              onPress={addPhoto}
              disabled={picking || busy}
              accessibilityRole="button"
              accessibilityLabel="Add a photo"
              style={{
                width: TILE,
                height: TILE,
                borderRadius: 14,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: c.line,
                backgroundColor: c.glassStrong,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                opacity: picking || busy ? 0.5 : 1,
              }}
            >
              <Txt size={22} accent>
                +
              </Txt>
              <Mono size={9} medium muted>
                {picking ? 'ADDING…' : 'PHOTO'}
              </Mono>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <Eyebrow>WHAT'S GOING ON?</Eyebrow>
        <TextInput
          testID="request-description"
          value={description}
          onChangeText={(t) => {
            setDescription(t);
            if (error) setError(null);
          }}
          multiline
          maxLength={DESCRIPTION_MAX}
          accessibilityLabel="What's going on?"
          placeholder={project ? 'e.g. The kitchen cabinets are chipped; we want them painted white with new pulls.' : "e.g. The back door sticks and won't latch unless you lean on it."}
          placeholderTextColor={c.muted}
          textAlignVertical="top"
          style={{ minHeight: 110, padding: 14, borderRadius: 14, backgroundColor: c.glassStrong, borderWidth: 1, borderColor: c.rule, fontSize: 16, lineHeight: 22, color: c.ink }}
        />
        <Mono size={10} muted style={{ alignSelf: 'flex-end' }}>
          {description.length} / {DESCRIPTION_MAX}
        </Mono>
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>WHERE IN THE HOME</Eyebrow>
        <ChoiceChips options={ROOMS} value={room} onChange={(r) => setRoom((cur) => (cur === r ? null : r))} testIDPrefix="request-room-" />
      </View>

      <View style={{ gap: 8 }}>
        <Eyebrow>HOW SOON</Eyebrow>
        <Segmented options={URGENCIES} value={urgency} onChange={setUrgency} testIDPrefix="request-urgency-" full />
        {urgency === 'urgent' ? (
          <Txt size={12} color={c.status.ochre} style={{ lineHeight: 17 }}>
            Urgent requests go to the top of the office's list, and we'll call you back quickly.
          </Txt>
        ) : null}
      </View>

      {error ? (
        <Txt testID="request-error" size={13} color={c.status.brick} accessibilityRole="alert">
          {error}
        </Txt>
      ) : null}
      <View testID="request-submit">
        <LqButton full onPress={submit} disabled={busy || picking || !ready}>
          {busy ? (photos.length ? 'Sending photos…' : 'Sending…') : 'Send to Premium Home'}
        </LqButton>
      </View>
      <LqCard style={{ gap: 4 }}>
        <Txt size={13} weight="600">
          What happens next
        </Txt>
        <Txt size={12} muted style={{ lineHeight: 18 }}>
          {project
            ? 'We call to schedule the assessment. Your estimate shows up here in Services, and you approve it in one tap.'
            : 'The office looks at it and adds it to your next visit, gets quotes from vetted partners, or writes back with advice. You see each step in Services.'}
        </Txt>
      </LqCard>
    </Screen>
  );
}
