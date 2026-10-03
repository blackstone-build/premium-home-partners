# Layout plan

Premium Home Partners is one Expo Router app. Homeowners, technicians, vendors, and the office share it. This plan records the structure the app had, the structure the feature move aims at, and the constraints CI enforces. The screens stay the same.

## Structure this work started from

Routes lived in `apps/mobile/src/app/` and owned most of the UI. Hooks lived in `src/data/` by role. Shared UI lived in `src/ui/`. Demo state lived in `src/store/`. Pricing math lived in `packages/pricing`.

CI ran typecheck, unit tests, the web export, and the PGlite database tests. `strict` was already on. Unused locals were not. Nothing linted, and nothing checked which folder may import which.

## Target structure

Each user-facing feature has a directory under `apps/mobile/src/features/`. `src/app/` stays, because Expo Router requires the route files there. Each route file only re-exports its feature screen.

Shared UI, theme tokens, session helpers, and `packages/pricing` stay shared. A role feature does not import another role feature. `auth` and `shell` are the shared chrome, so other features may import them. Widgets used by more than one role stay in `src/components/`.

`usePalette` does not read the demo store. The root layout passes the palette in. `src/ui` stays a presentation layer.

## Constraints CI enforces

- TypeScript `strict`, plus `noUnusedLocals` and `noUnusedParameters`, on the app, the pricing package, and the e2e project.
- Lint rules that fail the build on `any`, `@ts-ignore`, `@ts-expect-error`, and `@ts-nocheck`.
- `node scripts/check-boundaries.mjs`. A file in `src/app` may only re-export one feature screen. A role feature may not import another role. `src/ui` may not import the store, data, or a feature.
