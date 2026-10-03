# New customer

New customer is the signup form at `/signup`. It does not create an auth user. On a live demo it resets the seeded Jordan Lee home and opens onboarding. The offline-demo build redirects `/signup` to the launcher.

## Sub-features

- `signup-redirect` sends `/signup` to the launcher when demo mode is forced.
- `signup-form` collects first name, last name, email, and an optional phone, then opens onboarding. Live demo only.

## How to get to it (user POV)

- On a live build with demo access, choose **New customer** (`launch-signup`) on the launcher.
- Open `/signup` on that same build.

## Driving it with verify-php

Preconditions:

- `doctor` reports `"offlineDemo": true`.

- **Try the route.** Run `node .cursor/skills/verify-php/drive.mjs goto /signup`. The launcher is visible and the badge is **OFFLINE DEMO**.
- **Record the skip.** `signup-first-name`, `signup-submit`, and **Create my account** are not reachable. The unmet precondition is a live demo build. Do not mark the form verified.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot signup-redirect.png`.

## Gotchas

- The typed email is checked and then discarded. The session becomes the seeded new-customer account.
- Validation strings include **Enter your first name.** and **Enter an email like name@example.com.**
