# Office dispatch

Dispatch lists the week's visits and sends the 48-hour reminder.

## Sub-features

- `dispatch-week` shows the heading **Dispatch**.
- `dispatch-remind` clicks **Send 48-hr reminders** and shows **48-hr reminders sent ✓**.

## How to get to it (user POV)

- In the office app, choose the **Dispatch** tab (`office-tab-dispatch`).

## Driving it with verify-php

Preconditions:

- The office app is open (see office pricing).

- **Open.** Run `node .cursor/skills/verify-php/drive.mjs click --testid office-tab-dispatch`. **Dispatch** is visible.
- **Remind.** Run `node .cursor/skills/verify-php/drive.mjs click --role button --name "Send 48-hr reminders"`. The button reads **48-hr reminders sent ✓**.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot office-dispatch.png`.

## Gotchas

- On a phone, the week label **WEEK OF** may sit above the heading. The pass condition is the heading **Dispatch**, not the week eyebrow.
- The button becomes **Sending…** while the demo timer runs. Wait for the sent label before failing.
