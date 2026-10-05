// Build-time switches. Every EXPO_PUBLIC_* value is inlined into the client
// bundle, so these only ever describe which build this is. Unset means off:
// a production build ships none of the demo backdoors.

/** True only for the exact value "1". "0", "true", and empty are off. */
export function flagOn(value: string | undefined): boolean {
  return value === '1';
}

/**
 * Passwordless launcher: each side silently signs in to a seeded demo account.
 * The presentation demo sets EXPO_PUBLIC_DEMO_ACCESS=1. Production leaves it unset.
 */
export const DEMO_ACCESS = flagOn(process.env.EXPO_PUBLIC_DEMO_ACCESS);

/** Sign-in screen lists seeded accounts and fills the shared demo password. */
export const SHOW_DEMO_ACCOUNTS = flagOn(process.env.EXPO_PUBLIC_SHOW_DEMO_ACCOUNTS);

/**
 * Live office may show "Reset demo data", and live sign-in may offer the
 * offline-demo toggle. Implied by demo access. Offline demo (no Supabase, or
 * EXPO_PUBLIC_DEMO_MODE) still resets its own device store without this flag.
 */
export const DEMO_TOOLS = DEMO_ACCESS || flagOn(process.env.EXPO_PUBLIC_ALLOW_DEMO_TOOLS);

/**
 * Shared demo password. The string is only in builds that opt into demo access
 * or the demo-account card, so a production bundle does not contain it.
 */
export const DEMO_PASSWORD =
  process.env.EXPO_PUBLIC_DEMO_ACCESS === '1' || process.env.EXPO_PUBLIC_SHOW_DEMO_ACCOUNTS === '1' ? 'phpdemo2026' : '';
