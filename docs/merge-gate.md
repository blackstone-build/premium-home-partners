# Merge gate

`merge-gate` is the one status check that should be required on `main`. It passes only when every job below passed. Vercel preview deploys are not part of this gate. A green Vercel check does not make a pull request mergeable.

The job runs in `.github/workflows/ci.yml`. On a pull request it waits for `check`, `verify-php`, `skill-eval`, and `pr-size`. On a push to `main`, `pr-size` does not run, and a skip there is accepted. Any other skip, failure, or cancellation fails `merge-gate`.

## check

Typecheck, lint, import boundaries, the e2e project typecheck, unit tests, the web export, and the PGlite database tests.

- TypeScript `strict`, `noUnusedLocals`, and `noUnusedParameters` on the app, `packages/pricing`, and `e2e`.
- ESLint fails the build on `any`, `@ts-ignore`, `@ts-expect-error`, and `@ts-nocheck`.
- `node scripts/check-boundaries.mjs` fails when a route file is more than a re-export, when a role feature imports another role, or when `src/ui` imports the store, data, or a feature. `auth` and `shell` are the shared chrome.

## verify-php

`node scripts/verify-php-ci.mjs` drives the offline demo through the scenarios in `.cursor/skills/verify-php/eval/scenarios.md`. The score must be 1.

Timeouts: the job is 15 minutes, launch is 8 minutes, each command is 45 seconds, and the drive itself is 12 minutes. Screenshots and `score.json` upload as the `verify-php-<run id>` artifact.

## skill-eval

Runs after `verify-php`. The threshold is the `Threshold` line in `.cursor/skills/verify-php/eval/rubric.md`. It is 1.

The committed `score.json` must stay at or above that threshold, and its scenario list must match `scenarios.md`. When a pull request changes `.cursor/skills/**`, the fresh score in the verify-php artifact must also meet the threshold. A missing fresh score fails the job.

## pr-size

On pull requests only. Added lines plus deleted lines must be at most 400. Git rename detection is on. A pull request that is only renames, with zero added or deleted lines, passes. The job times out at 5 minutes.

## Repeated review comments

When the same review note shows up on a second pull request, turn it into a lint rule or a check in this file. Do not leave it as a comment the next author has to remember.

## Branch protection

After `merge-gate` is on `main` and green, protect `main` like this. Do not mark Vercel, `check`, `verify-php`, `skill-eval`, or `pr-size` as required. Those jobs are already inside `merge-gate`. Requiring them separately lets a Vercel success sit next to a failed gate and confuses the required list.

- Require a pull request before merging.
- Require the status check named `merge-gate`.
- Require that check to be up to date with the base branch.
- Allow auto-merge.
- Delete head branches after they merge, so a stacked pull request retargets.

Admins do not get a bypass. Do not weaken the required check to make a pull request merge.
