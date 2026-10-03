# Services

Services is the homeowner catalog. It has a Show us card and three lines. Maintenance, Seasonal, and Contracted.

## Sub-features

- `services-show` shows **Something not right?** and opens the request form.
- `services-lines` switches **Maintenance**, **Seasonal**, and **Contracted**.
- `services-book` requests quotes on a network tile and can book a bid. Bids arrive a few seconds later in the demo.

## How to get to it (user POV)

- Choose the **Services** tab after onboarding.

## Driving it with verify-php

Preconditions:

- Onboarding has finished in this session.

- **Open Services.** Run `node .cursor/skills/verify-php/drive.mjs click --role tab --name Services`. The heading **Services** is visible and **Something not right?** is visible.
- **Lines.** Run `node .cursor/skills/verify-php/drive.mjs click --testid services-line-seasonal`. **Seasonal** stays selected. Run `node .cursor/skills/verify-php/drive.mjs click --testid services-line-contracted`. A contracted row such as **Roofing** is visible. Run `node .cursor/skills/verify-php/drive.mjs click --testid services-line-maintenance`. **Lawn care** is visible.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot services.png`.

## Gotchas

- Network bids are timed. A **Book** button may be absent for a few seconds after **Get quotes**. Wait and run `text` again before calling the book step a failure.
- `addon-<id>` and `contracted-<id>` use the category id (`lawn`, `roof`), not the display name.
