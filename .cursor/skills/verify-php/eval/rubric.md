# verify-php rubric

This scores the offline-demo drive described in the verify-php feature map. The skill under test is the one on commit `9b1249b1b61160c24609d4491e724e3522134d44` (pull request #9). `main` does not contain that skill yet, so this record lives on its own branch.

## Score

`score = passed / total`.

`total` is the number of scenarios in `scenarios.md`. Each one is a pass or a fail. There is no partial credit inside a scenario.

**Threshold: 1.** Every scenario must pass. A later run that scores below 1 fails the eval.

## What counts as a pass

- The app is the offline demo. Doctor reports `"offlineDemo": true` before the first scenario that leaves the launcher.
- The command in the scenario exits 0.
- The heading, label, or URL named in the scenario is visible after the command.
- Where the scenario names a screenshot, the screenshot command exits 0.

## What is not in the score

These paths need a Supabase project. The offline build cannot complete them. They are recorded as skipped. A skip is not a pass and it is not a fail.

- The sign-in form (`login-email`, `login-password`, `login-submit`).
- The signup form (`signup-first-name`, `signup-submit`).
- Office **Reset demo data**.

The redirects away from `/login` and `/signup` are scenarios. They are in the score. The forms behind them are not.
