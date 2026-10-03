# Office requests

Requests is the office triage board. The demo seeds other clients' projects, including a roof assessment and a pool estimate.

## Sub-features

- `requests-board` shows the heading **Requests** inside `office-requests`.
- `requests-filters` switches **New**, **Projects**, **Scheduled/quoted**, and **Closed**.
- `requests-seed` shows **Roof inspection after the last storm** and **Pool resurfacing**.

## How to get to it (user POV)

- In the office app, choose the **Requests** tab (`office-tab-requests`).

## Driving it with verify-php

Preconditions:

- Run `reset` if an earlier flow changed request state.
- The office app is open.

- **Open.** Run `node .cursor/skills/verify-php/drive.mjs click --testid office-tab-requests`. **Requests** is visible.
- **Seeded work.** Run `node .cursor/skills/verify-php/drive.mjs expect-text "Pool resurfacing"`. Run `node .cursor/skills/verify-php/drive.mjs click --testid requests-filter-projects`. **Roof inspection after the last storm** is visible.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot office-requests.png`.

## Gotchas

- The **New** filter is the default. A project can also appear under **Projects**.
- `office-request-<id>` uses ids such as `demo-req-david` and `demo-req-whitfield` in the offline store.
- Routing buttons (`request-route-visit-<id>` and the others) act on new Show us items. The seeded projects are already past **New**. Do not expect those route buttons on the pool card.
