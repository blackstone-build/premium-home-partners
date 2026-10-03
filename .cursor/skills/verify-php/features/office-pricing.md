# Office pricing

Office pricing is the tier calculator at `/office/pricing`. `/office` redirects here. Tiles edit labor rate, trip fee, parts markup, and tech cost.

## Sub-features

- `office-pricing-open` shows **Tier pricing**.
- `office-pricing-rate` increments the labor rate tile `pricing-rate`.

## How to get to it (user POV)

- From the launcher, choose the office card (`launch-office`).
- Choose the **Pricing** tab (`office-tab-pricing`).

## Driving it with verify-php

Preconditions:

- `doctor` reports offline demo.
- Phone width is enough. The tabs are on the page. The sidebar title **PHP Office** needs `viewport --width 1280 --height 900`.

- **Open.** Run `node .cursor/skills/verify-php/drive.mjs click --testid launch-office`. The heading **Tier pricing** is visible and the URL contains `/office/pricing`.
- **Rate.** Read the page with `node .cursor/skills/verify-php/drive.mjs text`. Then run `node .cursor/skills/verify-php/drive.mjs click --role button --name Increase`. Read `text` again. The labor rate number is higher.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot office-pricing.png`.

## Gotchas

- Several **Increase** buttons exist, one per tile. The driver clicks the first visible one. Click the labor tile's control by scoping from the tile if the first match is the wrong tile. Read `text` before and after.
- Tier cards use `office-tier-0` through `office-tier-3`.
