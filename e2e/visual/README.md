# Visual regression

Full-page screenshots of 20 key screens and the primitives sheet, compared on every run against the
baselines committed in `__screenshots__/`. They exist so that every styling
change shows up as a reviewed image diff. **An unexplained diff is a
regression**: fix the code, do not update the baseline.

In CI the diffs are **advisory**. The visual projects run in their own
**Visual Diffs** job (`build.yml`), which is not a required check: a diff
leaves a warning on the run and uploads the `visual-diffs` artifact, but does
not fail the workflow. The required **E2E Tests** job runs every other
project. Refresh the baselines with the Visual Baselines workflow below.

## What is covered

| Spec | Screens |
| --- | --- |
| `member.visual.spec.ts` | sign-in (signed-out `/`), home, onboarding step 2, invite valid and expired, `/subscribe`, `/discord/link`, `/auth/denied`, the stored v2 Rewind at `/wrapped` |
| `admin.visual.spec.ts` | users, users with Plex down, user detail, settings, invites, queues, LLM usage, prompts; a 404 and an error state |
| `setup.visual.spec.ts` | setup wizard step 3 |
| `primitives.visual.spec.ts` | the `/dev/ui` primitives sheet (P3.4), dark and light; the web server sets `ENABLE_DEV_UI=1` |

Each screen is taken at 1440x900 (`visual-desktop`, `visual-setup-desktop`)
and at 390x844 with a 2x phone screen (`visual-mobile`,
`visual-setup-mobile`): 44 images. The setup projects depend on the
`setup-wizard` project, because reopening setup sends every other page to
`/setup`.

## How the screens are kept stable

- **Production build only.** The specs skip unless `E2E_SERVER=prod`, which
  makes `playwright.config.ts` run `npm run build:e2e` and `next start`.
- **Seed.** `e2e/helpers/seed-fixtures.ts` resets every table the screens read
  (users, invites, Rewind, LLM usage, prompts, announcement, service configs)
  before each spec file, and removes its extra rows afterwards. The server
  clock is not frozen, so dates shown relative to it ("Yesterday") are
  offsets from seed time; dates printed in full are fixed, so their width
  never moves a table column.
- **Browser.** `e2e/helpers/deterministic.ts` seeds `Math.random`, emulates
  reduced motion and pauses a fake clock at 2026-10-19 12:00 UTC. The specs
  then run the clock forward and finish every finite Web Animation, so
  entrances complete and loops stop at the same phase.
- **Sign-in.** `e2e/fixtures/session.ts` mints the NextAuth session cookie
  for a seeded user; no Plex round trip.
- **Masks.** Elements whose `data-testid` ends in `-timestamp` are masked
  (absolute dates), and `screenshot.css` hides anything marked
  `data-visual-mask` (the Node.js version, the Rewind auto-advance progress
  fill). Give a new absolute date a `*-timestamp` test id.

## Running the suite

```bash
E2E_SERVER=prod npx playwright test \
  --project=visual-desktop --project=visual-mobile \
  --project=visual-setup-desktop --project=visual-setup-mobile
```

Fonts and anti-aliasing differ between machines, so a local run can fail on a
Mac or a different Linux image. Baselines must come from the CI container
(`mcr.microsoft.com/playwright:v<@playwright/test version>-noble`), never from
a laptop. Do not commit images made with a local `--update-snapshots`.

## When to update the baselines

Only when a pull request changes the look on purpose (a styling PR, a new
component, copy that appears on a covered screen). In that PR, regenerate the
baselines through the workflow below and list each changed screen in the PR
description with a one-line reason. Reviewers look at every changed image.

## The Visual Baselines workflow

1. Push your branch (a branch of this repository; forks cannot use it).
2. Actions, **Visual Baselines**, **Run workflow**, enter the branch name.
3. The workflow runs the visual projects with `--update-snapshots=all` in the
   Playwright container and commits any changed images to the branch as
   `test(visual): update visual baselines`.
4. Pull the commit, and review the image diffs in the pull request ("Files
   changed" shows old and new images side by side).

The baseline commit needs the required checks on its own SHA, or the pull
request cannot merge. A push made with the default `GITHUB_TOKEN` starts no
workflow, so the workflow pushes with, in order of preference:

1. **A GitHub App token.** Set the repository variable
   `VISUAL_BASELINES_APP_ID` and the secret
   `VISUAL_BASELINES_APP_PRIVATE_KEY` for an app installed on this repository
   with contents write. Its push fires `pull_request: synchronize`.
2. **A fine-grained PAT** stored as the secret `VISUAL_BASELINES_TOKEN`, with
   contents write on this repository only. Same effect.
3. **Neither.** The workflow pushes with `GITHUB_TOKEN` and then dispatches
   `build.yml` on the branch, so the checks with the same job names land on
   the new SHA (Image Smoke Test only runs on pull requests, so it does not). If
   that is not enough, push an empty commit
   (`git commit --allow-empty -m "ci: rerun checks"`) or close and reopen the
   pull request by hand.

## Reading a failure

When a comparison fails, the Visual Diffs job warns "Screenshots differ from
the baselines", and the Playwright HTML report and `test-results/` (the
`visual-diffs` artifact in CI, `visual-baselines-report` from the workflow)
hold three images per screen: `-expected`, `-actual` and `-diff`, where
changed pixels are highlighted in red. Open the report with
`npx playwright show-report`, find the screen and compare. A diff you cannot
explain from your change is a regression.
