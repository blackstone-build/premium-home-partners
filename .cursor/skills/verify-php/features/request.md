# Request

Request is the form at `/homeowner/request`. Show us sends a photo-style note. A contracted row sends an assessment request.

## Sub-features

- `request-show` opens **Show us**, accepts a description, and returns to Services with a sent status.
- `request-project` opens **Request an assessment** for a contracted category.

## How to get to it (user POV)

- On Services, choose the Show us card (`show-us-start`).
- On the Contracted line, choose **ASSESS ›** on a category row.

## Driving it with verify-php

Preconditions:

- Onboarding has finished. Services is open.
- Run this on a fresh demo if an earlier request should not already be listed.

- **Show us.** Run `node .cursor/skills/verify-php/drive.mjs click --testid show-us-start`. The heading **Show us** is visible.
- **Describe.** Run `node .cursor/skills/verify-php/drive.mjs fill --testid request-description --value "The hallway switch sparks."`. Choose a room with `node .cursor/skills/verify-php/drive.mjs click --testid request-room-kitchen` and an urgency with `node .cursor/skills/verify-php/drive.mjs click --testid request-urgency-soon`.
- **Send.** Run `node .cursor/skills/verify-php/drive.mjs click --testid request-submit`. Services is visible again and the text includes **Sent**.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot request-sent.png`.

## Gotchas

- The description's accessible name is **What's going on?**. The test id is `request-description`.
- A project request needs `?kind=project&category=` or a contracted row. The heading then starts with **Request an assessment**.
- Photo add (`request-photo-add`) opens a file picker on web. Skip the photo control unless you can supply a file. The description alone is enough to send in the demo.
