# Launcher

The launcher is the first screen. It opens the homeowner, technician, vendor, and office apps, and it can clear the on-device demo store.

## Sub-features

- `launcher-open` shows the four apps and the **OFFLINE DEMO** badge.
- `launcher-reset` clears the demo store back to the welcome step.
- `launcher-theme` switches between **Light mode** and **Dark mode**.

## How to get to it (user POV)

- Open `/` on an offline-demo build.
- Open `/login`. Offline demo redirects here.
- From any role screen, choose **‹ All apps** or **All apps** (`app-exit`).

## Driving it with verify-php

Preconditions:

- `doctor` reports `"offlineDemo": true`.
- Run `reset` so the store is the seeded welcome state.

- **Open the launcher.** Run `node .cursor/skills/verify-php/drive.mjs goto /`. Then run `node .cursor/skills/verify-php/drive.mjs expect-text "One home, four apps"` and `node .cursor/skills/verify-php/drive.mjs expect-text "OFFLINE DEMO" --exact`.
- **Reset.** Run `node .cursor/skills/verify-php/drive.mjs click --role button --name "Reset demo"`. The launcher stays. The next homeowner open still shows **Set up my home**.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot launcher.png`. The image shows **One home, four apps** and **OFFLINE DEMO**.

## Gotchas

- A build that was exported with Supabase env vars shows **LIVE** instead of **OFFLINE DEMO**. Doctor fails that build. Delete `apps/mobile/dist` and launch again.
- **Exit offline demo** is absent when demo mode is forced. Forced is the verification build.
- **Reset demo** on this screen clears local storage. **Reset demo data** inside the office app is a different control and needs the server.
