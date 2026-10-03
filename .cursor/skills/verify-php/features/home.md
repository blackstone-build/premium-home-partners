# Home

Home is the homeowner's next visit. It shows the street, the visit window, and confirm or reschedule. After the technician finishes, a banner says the report is ready.

## Sub-features

- `home-next` shows **NEXT VISIT** after onboarding.
- `home-confirm` marks the visit confirmed.
- `home-banner` shows **Visit complete · report ready** after the technician sends the report.

## How to get to it (user POV)

- Finish onboarding. The app opens `/homeowner/home`.
- Choose the **Home** tab after the plan exists.
- From the launcher, choose the homeowner card once the home is set up.

## Driving it with verify-php

Preconditions:

- Complete the onboarding feature in this same session, or the home tab is not in the tree.
- `doctor` still reports the offline demo.

- **See the visit.** Run `node .cursor/skills/verify-php/drive.mjs expect-url /homeowner/home` and `node .cursor/skills/verify-php/drive.mjs expect-text "NEXT VISIT" --exact`.
- **Confirm.** Run `node .cursor/skills/verify-php/drive.mjs click --role button --name Confirm`. The button reads **Confirmed ✓**.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot home.png`.

## Gotchas

- Before onboarding, `/homeowner` redirects to onboarding. There is no next visit yet.
- The exit control on this tab reads **All apps**, without the chevron used on other screens. The test id is still `app-exit`.
