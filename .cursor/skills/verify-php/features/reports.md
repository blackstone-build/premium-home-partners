# Reports

Reports lists visit reports. Before the technician finishes, the empty state says the first report arrives after the visit. Afterward, a card opens the visit report and the home health score.

## Sub-features

- `reports-empty` shows **Your first report arrives after the visit** before a completed visit.
- `reports-detail` opens **Visit report** and **Home health** from `report-card`.

## How to get to it (user POV)

- Choose the **Reports** tab after onboarding.

## Driving it with verify-php

Preconditions:

- For the empty state, onboarding is done and the technician flow has not completed.
- For the detail, the technician feature has sent the report in this session.

- **Empty.** Run `node .cursor/skills/verify-php/drive.mjs click --role tab --name Reports`. **Your first report arrives after the visit** is visible. Screenshot `reports-empty.png`.
- **Detail.** After the technician flow, open the homeowner app, choose **Reports**, and run `node .cursor/skills/verify-php/drive.mjs click --testid report-card`. **Visit report** and **Home health** are visible. Screenshot `reports-detail.png`.

## Gotchas

- `report-card` repeats when several reports exist. Click the visible one.
- The empty copy is absent once a report exists. Run the empty check first.
