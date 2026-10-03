# Office quotes

Add-on quotes lists brokered work, open requests, booked jobs, and coordination fees.

## Sub-features

- `quotes-open` shows **Add-on quotes**.
- `quotes-stats` shows **Open requests**, **Booked**, and **Coordination fees**.

## How to get to it (user POV)

- In the office app, choose the **Add-on quotes** tab (`office-tab-quotes`).

## Driving it with verify-php

Preconditions:

- The office app is open.

- **Open.** Run `node .cursor/skills/verify-php/drive.mjs click --testid office-tab-quotes`. The heading **Add-on quotes** is visible.
- **Stats.** `office-open`, `office-booked`, and `office-fees` are on the page. Run `node .cursor/skills/verify-php/drive.mjs expect-text "Coordination fees"`.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot office-quotes.png`.

## Gotchas

- An empty demo says **No requests yet. Tap a service in the homeowner app.** That sentence is a pass for the empty state, not a failure.
- A booked row appears after the homeowner books a bid. The fee is about 10 percent of the booked price on a live build. Offline demo uses the on-device store.
