# Sign in

Sign in is the email and password form at `/login`. On the offline-demo build this skill launches, that route redirects to the launcher. A successful password sign-in needs a Supabase project, which this skill does not configure.

## Sub-features

- `signin-redirect` sends `/login` to the launcher when demo mode is forced.
- `signin-form` shows **EMAIL**, **PASSWORD**, and **Sign in** on a live build with demo access.
- `signin-fill` fills a demo account chip without submitting it.

## How to get to it (user POV)

- On a live build, choose **Sign in with email** on the launcher.
- On a live build with demo access off, opening `/` while signed out lands here.
- On the offline-demo build, opening `/login` does not stay here.

## Driving it with verify-php

Preconditions:

- `doctor` reports `"offlineDemo": true`.

- **Try the route.** Run `node .cursor/skills/verify-php/drive.mjs goto /login`. The URL returns to `/` and **OFFLINE DEMO** is visible.
- **Record the skip.** The form fields `login-email`, `login-password`, and `login-submit` are not on this build. Do not report them as verified. The unmet precondition is a Supabase-configured build with demo mode off.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot sign-in-redirect.png` and `node .cursor/skills/verify-php/drive.mjs expect-url /`.

## Gotchas

- Demo account chips (`demo-account-homeowner` and the others) only fill the form. They do not sign in.
- The live launcher signs in without this form. That is a different entry, and it needs Supabase.
