// Small Services v2 building blocks made from the existing primitives:
// request photo thumbnails (RemotePhoto on the `request-photos` bucket, or a
// local URI in demo mode), a wrap row of choice chips (Pill), and the colored
// status line used on request cards.

import { View, type StyleProp, type ViewStyle } from 'react-native';
import { REQUEST_PHOTO_BUCKET, RemotePhoto } from '../lib/photos';
import type { LineTone, RequestPhotoVM } from '../data/servicesModel';
import { Pill } from '../ui/controls';
import { Txt } from '../ui/primitives';
import { usePalette } from '../ui/theme';

/** A row of square request photos. Signed URLs when the list has them, else each thumbnail signs its own path. */
export function RequestPhotoThumbs({
  photos,
  size = 56,
  testIDPrefix,
  style,
}: {
  photos: readonly RequestPhotoVM[];
  size?: number;
  /** Each image gets testID `${testIDPrefix}${index}`. */
  testIDPrefix?: string;
  style?: StyleProp<ViewStyle>;
}) {
  if (!photos.length) return null;
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>
      {photos.map((p, i) => (
        <RemotePhoto
          key={p.id}
          path={p.path}
          uri={p.uri}
          bucket={REQUEST_PHOTO_BUCKET}
          height={size}
          radius={10}
          caption={null}
          style={{ width: size }}
          testID={testIDPrefix ? `${testIDPrefix}${i}` : undefined}
        />
      ))}
    </View>
  );
}

/** Pill chips for a single choice; the chosen one is filled with the accent. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: readonly { key: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  /** Each chip gets testID `${testIDPrefix}${key}`. */
  testIDPrefix?: string;
}) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pill
            key={o.key}
            label={o.label}
            bg={on ? c.accent : 'transparent'}
            ink={on ? c.accentInk : c.ink}
            border={on ? undefined : c.rule}
            selected={on}
            testID={testIDPrefix ? `${testIDPrefix}${o.key}` : undefined}
            onPress={() => onChange(o.key)}
          />
        );
      })}
    </View>
  );
}

/** The live status line on a request card: a tone dot and the text. */
export function StatusLine({ text, tone, testID }: { text: string; tone: LineTone; testID?: string }) {
  const c = usePalette();
  const color = tone === 'neutral' ? c.muted : c.status[tone];
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone === 'neutral' ? c.rule : color }} />
      <Txt size={13} weight="600" color={color} style={{ flexShrink: 1, lineHeight: 18 }}>
        {text}
      </Txt>
    </View>
  );
}
