# Technician

The technician app lists today's route and opens the active stop. The job screen moves from driving, to on site, through the checklist, and sends the report.

## Sub-features

- `tech-route` shows **Today's route** and a stop that ends in **tap to open ›**.
- `tech-advance` runs **Start driving · notify client** and then **Mark arrived on site**.
- `tech-checklist` checks every task checkbox.
- `tech-finish` shows **Report sent ✓**.

## How to get to it (user POV)

- From the launcher, choose the technician card (`launch-tech`).
- Open `/tech`.

## Driving it with verify-php

Preconditions:

- `reset`, then finish onboarding, so the route has a visit. A brand-new store still has a scheduled stop in the demo, and onboarding attaches the plan the homeowner sees.
- Use `app-exit` to return to the launcher between roles.

- **Route.** Run `node .cursor/skills/verify-php/drive.mjs click --testid launch-tech`. **Today's route** is visible.
- **Open the stop.** Run `node .cursor/skills/verify-php/drive.mjs click --role button --name "tap to open"`. The client name is the heading.
- **Advance.** Run `node .cursor/skills/verify-php/drive.mjs click --role button --name "Start driving · notify client"`, then `node .cursor/skills/verify-php/drive.mjs click --role button --name "Mark arrived on site"`.
- **Checklist.** Click `task-hvac`, `task-fridge`, `task-ice`, `task-dish`, `task-wh`, `task-dryer`, and `task-smoke` with `node .cursor/skills/verify-php/drive.mjs click --testid task-hvac` and the same command for each other id. The checklist count matches the number of checked boxes.
- **Finish.** Run `node .cursor/skills/verify-php/drive.mjs click --role button --name "Complete & send report"`. **Report sent ✓** is visible.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot tech-report-sent.png`.

## Gotchas

- The checklist stays locked until **Mark arrived on site**. **Complete all tasks to finish** is the disabled label before that.
- In the demo, only the active stop opens `/tech/job`, and the URL has no visit id.
- Hidden checkboxes from a previous screen are not visible. The driver clicks the visible match.
