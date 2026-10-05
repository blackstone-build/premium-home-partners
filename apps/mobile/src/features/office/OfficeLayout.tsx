import { Slot, router, usePathname } from 'expo-router';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppExitLink } from '../auth/AppExitLink';
import { RoleGate } from '../auth/RoleGate';
import { useResetDemo } from '../../data/office';
import { DEMO_TOOLS } from '../../lib/flags';
import { useMode } from '../../lib/mode';
import { useNewRequestCount } from '../../data/officeRequests';
import { Stage } from '../../ui/controls';
import { Display, LqButton, LqGlass, Mono, Txt } from '../../ui/primitives';
import { usePalette } from '../../ui/theme';

const TABS = [
  { key: 'pricing', href: '/office/pricing', label: 'Pricing' },
  { key: 'dispatch', href: '/office/dispatch', label: 'Dispatch' },
  { key: 'quotes', href: '/office/quotes', label: 'Add-on quotes' },
  { key: 'requests', href: '/office/requests', label: 'Requests' },
] as const;

export default function OfficeLayout() {
  return (
    <RoleGate role="office">
      <OfficeConsole />
    </RoleGate>
  );
}

/** "Reset demo data": full-width ghost at the foot of the sidebar, or the last item of the phone tab row. */
function ResetDemo({ wide }: { wide: boolean }) {
  const { mode } = useMode();
  const reset = useResetDemo();
  // Live production must not offer a button that wipes the database. Offline
  // demo still resets this device. EXPO_PUBLIC_DEMO_ACCESS or ALLOW_DEMO_TOOLS
  // puts the server reset back for the presentation build.
  if (mode === 'live' && !DEMO_TOOLS) return null;
  return (
    <LqButton
      variant="ghost"
      disabled={reset.pending}
      onPress={reset.run}
      style={wide ? { alignSelf: 'stretch' } : { minHeight: 0, paddingVertical: 9, paddingHorizontal: 12 }}
    >
      <Txt testID="office-reset" size={wide ? 14 : 13} weight="500">
        {reset.pending ? 'Resetting…' : 'Reset demo data'}
      </Txt>
    </LqButton>
  );
}

/** Office console: 200pt sidebar + content on tablet/desktop, top tabs on phones. */
function OfficeConsole() {
  const c = usePalette();
  const path = usePathname();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 820;
  const newRequests = useNewRequestCount();

  const nav = TABS.map((t) => {
    const on = path.startsWith(t.href);
    const count = t.key === 'requests' ? newRequests : 0;
    return (
      <Pressable
        key={t.href}
        testID={`office-tab-${t.key}`}
        onPress={() => router.replace(t.href)}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        accessibilityLabel={count ? `${t.label}, ${count} new` : t.label}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 12,
          backgroundColor: on ? c.accent : 'transparent',
        }}
      >
        <Txt weight="600" color={on ? c.accentInk : c.ink}>
          {t.label}
        </Txt>
        {count ? (
          <View style={{ minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 10, backgroundColor: on ? c.accentInk : c.accent, alignItems: 'center' }}>
            <Mono size={10} medium color={on ? c.accent : c.accentInk}>
              {count}
            </Mono>
          </View>
        ) : null}
      </Pressable>
    );
  });

  return (
    <Stage>
      <ScrollView contentContainerStyle={{ padding: wide ? 32 : 16, paddingTop: insets.top + (wide ? 28 : 12), paddingBottom: insets.bottom + 60, gap: 12 }}>
        <View style={{ width: '100%', maxWidth: 1320, alignSelf: 'center', gap: 12 }}>
          <AppExitLink />
          <LqGlass style={{ flexDirection: wide ? 'row' : 'column', minHeight: 720 }}>
            {wide ? (
              <View style={{ width: 200, borderRightWidth: 1, borderColor: c.rule, paddingVertical: 22, paddingHorizontal: 14, gap: 4 }}>
                <Display size={20} style={{ paddingHorizontal: 10, paddingBottom: 16 }}>
                  PHP Office
                </Display>
                {nav}
                <View style={{ flex: 1, minHeight: 16 }} />
                <ResetDemo wide />
              </View>
            ) : (
              <View style={{ padding: 14, borderBottomWidth: 1, borderColor: c.rule, gap: 8 }}>
                <Mono size={11} medium tracking={0.1} muted>
                  PHP OFFICE
                </Mono>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator
                  style={{ flexGrow: 0 }}
                  contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  {nav}
                  <ResetDemo wide={false} />
                </ScrollView>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0, paddingVertical: 24, paddingHorizontal: wide ? 28 : 16, gap: 18 }}>
              <Slot />
            </View>
          </LqGlass>
        </View>
      </ScrollView>
    </Stage>
  );
}
