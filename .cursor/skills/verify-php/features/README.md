# Premium Home Partners verification map

This directory is the maintained source for verifying the user-facing behavior of Premium Home Partners. Read this index, then use the matching feature file.

## Baseline preconditions

- Launch with `node .cursor/skills/verify-php/drive.mjs launch` from the repo root.
- The ready URL is `http://127.0.0.1:8117` unless `VERIFY_PHP_PORT` is set.
- The build is offline demo. The badge reads **OFFLINE DEMO**.
- Run `node .cursor/skills/verify-php/drive.mjs doctor` and require `"ok": true` and `"offlineDemo": true`.
- Run `reset` before a feature that needs the seeded demo store.
- Never drive an instance that this verification run did not start. Never drive `https://premium-home-partners.vercel.app`.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer `data-testid` (`--testid`) and accessible names (`--role`, `--label`).
- Treat every command as literal.
- The web stack keeps earlier screens mounted and hidden. The driver already filters to the visible match.
- Viewport starts at 390×844. Office sidebar checks use `viewport --width 1280 --height 900`.
- Do not remove proof files during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state.
- UI proof is an `expect-text` or `expect-url` plus a screenshot under `/tmp/verify-php-evidence/<run-id>/`.
- Record the feature file name with the screenshot.
- Report an unreachable path with the command you tried and the unmet precondition. Sign-in success, signup, and server demo reset need Supabase, which this skill does not configure.

## Features

- [Launcher](./launcher.md) opens the four apps from **One home, four apps**.
- [Sign in](./sign-in.md) is the email form. Offline demo redirects `/login` to the launcher.
- [New customer](./signup.md) is the signup form. Offline demo cannot open it.
- [Onboarding](./onboarding.md) walks address, plates, home details, research, and a tier.
- [Home](./home.md) shows the next visit after a plan starts.
- [Plan](./plan.md) shows the monthly price and the year of care.
- [Reports](./reports.md) shows the visit report after the technician finishes.
- [Services](./services.md) shows Show us, maintenance, seasonal, and contracted lines.
- [Request](./request.md) sends a Show us note or a contracted assessment.
- [Technician](./tech.md) drives the route, the checklist, and the report.
- [Vendor](./vendor.md) opens quote requests and submits a bid.
- [Office pricing](./office-pricing.md) shows tier prices and the labor rate.
- [Office dispatch](./office-dispatch.md) lists the week and sends the 48-hour reminder.
- [Office quotes](./office-quotes.md) lists brokered add-on quotes and coordination fees.
- [Office requests](./office-requests.md) triages seeded client requests.
