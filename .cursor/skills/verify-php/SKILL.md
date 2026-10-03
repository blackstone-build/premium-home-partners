---
name: verify-php
description: "Drive Premium Home Partners in a headless browser the way a homeowner, technician, vendor, or office user does. Use when a change needs proof that a screen still works, or when maintaining the feature map under .cursor/skills/verify-php/features/."
---

# Verify Premium Home Partners

Premium Home Partners is one Expo web app with four roles. This skill launches an offline-demo build and drives it with Chromium. The feature map in `features/` is the list of screens. A proof that only opens the launcher is incomplete when the map lists other entry points.

Do not point this skill at the production Vercel URL. Do not set `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` for a verification build. Live signup, live sign-in, and the office "Reset demo data" call need a Supabase project. This skill does not configure one.

## Launch

From the repo root:

```bash
node .cursor/skills/verify-php/drive.mjs launch
```

Run that in the background. It is ready when stdout is JSON with `"ok": true` and a `url` of `http://127.0.0.1:8117`.

What it does:

- Exports the web app with `npm run build:web` when `apps/mobile/dist/index.html` is missing or when `apps/mobile/dist/.verify-php-demo` is missing. The export forces `EXPO_PUBLIC_DEMO_MODE=1` and strips Supabase URL and anon key from the child environment.
- Serves `apps/mobile/dist` with `node e2e/serve.mjs` on port `8117` (`VERIFY_PHP_PORT` overrides the port).
- Opens headless Chromium at 390×844, `America/Chicago`, with an empty profile.

Ready means the log line `e2e/serve.mjs: serving` and the heading **One home, four apps** are both present.

A second `launch` while a session is healthy exits 2. One browser owns the demo store. Two drivers on one server would share `localStorage` and corrupt the run.

## Doctor

```bash
node .cursor/skills/verify-php/drive.mjs doctor
```

Doctor is worth driving only when `"ok": true`, `"offlineDemo": true`, and `"status": 200`. Run it before the first action, and again after any command that throws.

## Drive

Every command talks to the session started by `launch`. Clicks and text checks use the visible match only. The web stack keeps earlier screens mounted and hidden.

```bash
node .cursor/skills/verify-php/drive.mjs goto /
node .cursor/skills/verify-php/drive.mjs click --testid launch-homeowner
node .cursor/skills/verify-php/drive.mjs click --role button --name "Set up my home"
node .cursor/skills/verify-php/drive.mjs click --role tab --name Reports
node .cursor/skills/verify-php/drive.mjs fill --label "YOUR NAME" --value "Elena Alvarez"
node .cursor/skills/verify-php/drive.mjs expect-text "OFFLINE DEMO"
node .cursor/skills/verify-php/drive.mjs expect-text "NEXT VISIT" --exact
node .cursor/skills/verify-php/drive.mjs expect-url /homeowner/home
node .cursor/skills/verify-php/drive.mjs text
node .cursor/skills/verify-php/drive.mjs screenshot launcher.png
node .cursor/skills/verify-php/drive.mjs viewport --width 1280 --height 900
node .cursor/skills/verify-php/drive.mjs reset
```

`reset` clears `localStorage` and reloads `/`. Use it between features so one flow does not depend on another feature's clicks. `viewport` is for the office sidebar, which appears at width 820 or more. Phone width still shows the office tabs.

Exit code 0 and `"ok": true` is a pass. Anything else is a fail. Read the `error` field and the `text` command before deciding the app is broken.

## Evidence

Screenshots and the launch JSON go under `/tmp/verify-php-evidence/<run-id>/`. The `launch` JSON prints that directory as `evidence`.

A proof needs both of these:

- The action (the command you ran).
- The resulting state (`expect-text`, `expect-url`, or a screenshot that shows the heading you claim).

Capture the screen after the click, not only the final screen of a long flow. Do not treat a toast alone as proof when the map says a later screen must show the result.

## Cleanup

```bash
node .cursor/skills/verify-php/drive.mjs cleanup
```

Cleanup stops the browser and the static server this session started. It checks `/proc/<pid>/cmdline` and will not signal a pid that is not `drive.mjs` or `e2e/serve.mjs`. It deletes `/tmp/verify-php`. It does not delete `/tmp/verify-php-evidence`. After cleanup, confirm the screenshot path from the run still exists.

Run cleanup after a failed launch too, so the port is free for the next try.

## Keeping this map current

When a screen changes, update this skill with the maintain-verification-skill pass. Edit only `.cursor/skills/verify-php/`. Do not change product code in that pass.

1. Read `features/README.md` and the sibling files. Add a missing screen, and delete a file for a screen that is gone.
2. Re-read the route each feature names. Fix selectors that the source no longer has.
3. Launch, doctor, and drive every feature the offline demo can reach. Doctor again after a failed drive. If the UI is wedged and doctor still says the process is healthy, `reset` or relaunch.
4. Ship at most one pull request of map or harness corrections. If the app no longer does what a feature file says, report that as a product gap and leave the map describing the break.

Offline demo cannot complete sign-in, signup, or the server "Reset demo data" button. Those files stay in the map with that precondition. Do not mark them verified through the launcher.

## Helpers

`drive.mjs` is the only helper. Invoke it as `node .cursor/skills/verify-php/drive.mjs <command>` from the repo root. The commands are the ones in Drive.
