# Plan

Plan shows the chosen tier, the monthly price, and the year of care. **Change coverage** opens the tier list.

## Sub-features

- `plan-price` shows the monthly amount in `plan-monthly`.
- `plan-change` opens **Change coverage** and returns with **Done**.
- `plan-year` shows **Your year of care**.

## How to get to it (user POV)

- After onboarding, choose the **Plan** tab.

## Driving it with verify-php

Preconditions:

- Onboarding has finished in this session.
- The home screen is the current page, or you can still reach the tabs.

- **Open Plan.** Run `node .cursor/skills/verify-php/drive.mjs click --role tab --name Plan`. The heading **Your plan** is visible and **Your year of care** is visible.
- **Price.** Run `node .cursor/skills/verify-php/drive.mjs text` and confirm a dollar amount is present.
- **Change coverage.** Run `node .cursor/skills/verify-php/drive.mjs click --role button --name "Change coverage ›"`. Then run `node .cursor/skills/verify-php/drive.mjs click --role button --name Done`. **Your plan** is visible again.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot plan.png`.

## Gotchas

- The tab has no test id. Use the accessible name **Plan**.
- Office labor-rate edits change this price on a live build. Offline demo keeps the price on this device only.
