# Vendor

The vendor portal lists quote requests and submits a price and a date. After a submit, the row reads **Quote sent**.

## Sub-features

- `vendor-list` shows **Quote requests**.
- `vendor-bid` submits **Submit quote** on `/vendor/<id>`.

## How to get to it (user POV)

- From the launcher, choose the vendor card (`launch-vendor`).
- Open `/vendor`, then open a request row.

## Driving it with verify-php

Preconditions:

- A quote request exists. From Services, choose **Get quotes** on a maintenance tile and wait until the vendor list shows **New request**. The demo can also already show open requests from the seed. Run `text` on `/vendor` before assuming the list is empty.

- **List.** Run `node .cursor/skills/verify-php/drive.mjs click --testid launch-vendor`. The heading **Quote requests** is visible.
- **Open a row.** Run `node .cursor/skills/verify-php/drive.mjs click --testid vendor-request-lawn` when that id is visible. Otherwise click the visible row whose text is **New request**.
- **Submit.** Run `node .cursor/skills/verify-php/drive.mjs click --testid vendor-submit`. **Quote sent** is visible.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot vendor-quote-sent.png`.

## Gotchas

- `vendor-request-<category>` uses the category id, not the request id. Two requests in one category share that id.
- The price steppers are **Decrease** and **Increase**. The default price can be submitted without editing it.
- **Won · scheduled** appears only after the homeowner books the bid. That is the services book step, not this screen.
