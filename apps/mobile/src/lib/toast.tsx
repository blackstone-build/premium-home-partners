// toast(message, tone?, action?) shows a glass pill at the bottom for 3 s
// (6 s when it offers an action, e.g. Retry). <ToastHost /> is mounted once by the root layout.

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STATUS } from '../theme/tokens';
import { LqGlass, Txt } from '../ui/primitives';
import { usePalette } from '../ui/theme';

export type ToastTone = 'neutral' | 'forest' | 'brick';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastMsg {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

const DURATION = 3000;
const ACTION_DURATION = 6000;
let seq = 0;
let current: ToastMsg | null = null;
const listeners = new Set<(t: ToastMsg | null) => void>();

/** Show a short message: mutation errors (brick), confirmations (forest) or neutral notes, optionally with one action. */
export function toast(message: string, tone: ToastTone = 'neutral', action?: ToastAction) {
  current = { id: ++seq, message, tone, action };
  listeners.forEach((l) => l(current));
}

function dismiss(id: number) {
  if (current?.id !== id) return;
  current = null;
  listeners.forEach((l) => l(null));
}

const useNative = Platform.OS !== 'web';

export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(current);
  const v = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const c = usePalette();

  useEffect(() => {
    const l = (t: ToastMsg | null) => setMsg(t);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!msg) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: useNative }).start();
    const hide = setTimeout(() => {
      Animated.timing(v, { toValue: 0, duration: 220, easing: Easing.in(Easing.ease), useNativeDriver: useNative }).start(({ finished }) => {
        if (finished) setMsg((m) => (m && m.id === msg.id ? null : m));
      });
    }, msg.action ? ACTION_DURATION : DURATION);
    return () => clearTimeout(hide);
  }, [msg, v]);

  if (!msg) return null;
  const dot = msg.tone === 'neutral' ? c.accent : STATUS[msg.tone];
  const action = msg.action;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 96, alignItems: 'center', paddingHorizontal: 22 }}
    >
      <Animated.View
        style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }], maxWidth: 400 }}
      >
        <LqGlass strong style={{ borderRadius: 999, boxShadow: `0 8px 24px -10px ${c.sh}` }}>
          <View
            testID="toast"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 16 }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
            <Txt size={13} weight="500" style={{ flexShrink: 1 }}>
              {msg.message}
            </Txt>
            {action ? (
              <Pressable
                testID="toast-action"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  dismiss(msg.id);
                  action.onPress();
                }}
                style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: c.accent }}
              >
                <Txt size={12} weight="600" color={c.accentInk}>
                  {action.label}
                </Txt>
              </Pressable>
            ) : null}
          </View>
        </LqGlass>
      </Animated.View>
    </View>
  );
}
