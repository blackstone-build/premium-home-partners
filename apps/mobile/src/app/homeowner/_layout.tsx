import { Stack } from 'expo-router';
import { RoleGate } from '../../components/RoleGate';
import { usePalette } from '../../ui/theme';

export default function HomeownerLayout() {
  const c = usePalette();
  return (
    <RoleGate role="homeowner">
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.field }, animation: 'fade' }}>
        {/* Show us / Request an assessment, opened from the Services tab (docs/SERVICES_V2.md). */}
        <Stack.Screen name="request" />
      </Stack>
    </RoleGate>
  );
}
