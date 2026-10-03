# Onboarding

Onboarding sets up the home. Address, five serial plates, home details, a research progress step, then a coverage tier. Finishing it opens the home tab.

## Sub-features

- `onboard-welcome` shows **Set up my home**.
- `onboard-address` prefills Elena Alvarez and 12 Linden Court.
- `onboard-scan` captures five plates and shows **All 5 appliances found**.
- `onboard-details` builds a plan from the home questions.
- `onboard-research` reaches **100%** and enables **See my plan options**.
- `onboard-tier` starts a tier and lands on `/homeowner/home`.

## How to get to it (user POV)

- From the launcher, choose the homeowner card (`launch-homeowner`) while the home is not set up.
- Open `/homeowner` before a plan exists. The app redirects to `/homeowner/onboarding`.

## Driving it with verify-php

Preconditions:

- `doctor` reports `"offlineDemo": true`.
- Run `reset` first. The seeded step is the welcome screen.

- **Open welcome.** Run `node .cursor/skills/verify-php/drive.mjs click --testid launch-homeowner`. **Set up my home** is visible.
- **Address.** Run `node .cursor/skills/verify-php/drive.mjs click --role button --name "Set up my home"`. The **YOUR NAME** field reads `Elena Alvarez`. The **SERVICE ADDRESS** field reads `12 Linden Court, Mountain Brook, AL 35213`. Run `node .cursor/skills/verify-php/drive.mjs click --role button --name Continue`.
- **Plates.** The shutter is the button named **Capture serial plate**. Click it five times. After the fifth click, **All 5 appliances found** is visible. Run `node .cursor/skills/verify-php/drive.mjs click --role button --name Continue`.
- **Details.** Run `node .cursor/skills/verify-php/drive.mjs click --role button --name "Build my plan"`.
- **Research.** **See my plan options** becomes enabled and **100%** is visible. Click **See my plan options**.
- **Start.** Click the button whose name starts with `Start `. The URL contains `/homeowner/home` and **NEXT VISIT** is visible.
- **Proof.** Run `node .cursor/skills/verify-php/drive.mjs screenshot onboarding-home.png` on the home screen.

## Gotchas

- **Capture at least one** stays disabled until one plate is captured. The demo shutter does not open a camera.
- **See my plan options** stays disabled until the progress text is **100%**.
- Live-only controls `scan-real-plate` and `scan-manual` are absent in offline demo.
