# Agent Impact Visibility Run

## Agents

- Product/QA Agent Laplace: recommended the smallest useful Mission Control improvement: show product impact for shipped PRs and blockers.
- Manager/Integrator: added the static impact fields, rendered them on `/agents`, and tightened tests.

## Done

- Added product impact text to shipped agent PRs.
- Added blocked product impact text to owner/system blockers.
- Rendered an `Impact` column in shipped PR and blocker tables.
- Updated Mission Control validation so impact text is required.

## Why

The founder should not only see that agents are busy. They should see whether each slice improves trader workflow, launch readiness, data trust, or beta feedback quality.

## Learned

The existing Mission Control page had useful activity tracking, but it was still too engineering-centered. Adding impact makes it easier to judge whether the agent loop is producing product leverage.

## Improve Next

- Add live PR/check ingestion only after GitHub token and caching rules are designed.
- Add a lightweight impact score once enough beta feedback exists to calibrate it.
