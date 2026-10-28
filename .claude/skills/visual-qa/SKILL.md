---
name: visual-qa
description: How to run, read and update this repository's Playwright screenshot, accessibility and performance checks, and how to take a quick look at a page. Use when writing or changing E2E or visual specs, when a visual diff or axe failure shows up, or before asking for new baselines.
paths:
  - "e2e/**"
---

# Visual QA

Screenshots exist so every styling change shows up as a reviewed image diff.
An unexplained diff is a regression: fix the code, not the baseline.

Read `e2e/visual/README.md` and the Rewind section of `e2e/README.md` first;
the projects live in `playwright.config.ts`.

## The projects

| Projects | Specs | In CI |
|---|---|---|
| `chromium`, `setup-wizard` | the functional specs in `e2e/` | E2E Tests (required) |
| `visual-desktop`, `visual-mobile`, `visual-setup-desktop`, `visual-setup-mobile` | the app screens in `e2e/visual/*.visual.spec.ts`, 1440x900 and 390x844 | Visual Diffs (advisory) |
| `rewind-visual-phone-chromium`, `rewind-visual-phone-webkit`, `rewind-visual-desktop-chromium`, `rewind-visual-desktop-webkit` | `e2e/visual/rewind.spec.ts` (every page of three issues at the five phone sizes or 1440x900, plus the 12 px text and 44 px target checks) and `e2e/visual/rewind-cards.spec.ts` (the cards, phone chromium only) | Rewind Visual Diffs (advisory) |
| `rewind-a11y-chromium`, `rewind-a11y-webkit`, `rewind-a11y-firefox` | `e2e/a11y/rewind.a11y.spec.ts` and the other Rewind axe specs: zero violations at WCAG 2.2 AA | E2E Tests (required) |
| `csp-chromium`, `csp-webkit`, `csp-firefox` | `e2e/csp.spec.ts`: no CSP violation and a nonce on every server-rendered script, on every axe route and the Rewind story | E2E Tests (required) |
| `rewind-e2e-chromium`, `rewind-e2e-webkit`, `rewind-e2e-firefox` | the Rewind flows in `e2e/rewind/` | E2E Tests (required) |
| `rewind-perf` | `e2e/perf/rewind.perf.spec.ts` and `e2e/perf/rewind-budget.perf.spec.ts` | Rewind Performance (required) |
| `visual-light-desktop`, `visual-light-mobile`, `visual-light-rewind`, `a11y-light` | the light theme (the `pm-theme=light` cookie) | not in CI |

## Running

- Visual specs skip unless `E2E_SERVER=prod`: the config then runs
  `npm run build:e2e` and `next start` (`E2E_PREBUILT=1` reuses a build).
- App screens: `E2E_SERVER=prod npx playwright test --project=visual-desktop --project=visual-mobile`.
- Rewind pages: `E2E_SERVER=prod npx playwright test --project=rewind-visual-phone-chromium`.
- Run only the projects your change touches; the screens are seeded and
  frozen by `e2e/helpers/seed-fixtures.ts`, `e2e/helpers/seed-rewind.ts` and
  `e2e/helpers/deterministic.ts`.
- Selectors are `data-testid` only. Specs import fixtures from
  `e2e/fixtures/auth.ts` or `e2e/fixtures/session.ts` and never import from
  `__tests__/` or a module that reaches `server-only`; Rewind issues come from
  the JSON in `e2e/fixtures/rewind/`. `npx playwright test --list` checks that
  the suite still collects.

## Updating baselines

- Only when the change is meant to change the look. Baselines must come from
  the CI container: run the Visual Baselines workflow
  (`.github/workflows/visual-baselines.yml`) on the branch with the `app`,
  `rewind`, `light` or `all` suite. Never commit images from a local
  `--update-snapshots`; fonts and anti-aliasing differ between machines.
- List every changed screen in the pull request with a one-line reason; the
  checklist in `.github/pull_request_template.md` asks for the visual diff.
- A new absolute date gets a test id ending in `-timestamp` (masked), and
  anything else that moves gets `data-visual-mask` (`e2e/visual/screenshot.css`).
- The app's axe baseline, `e2e/a11y/axe-baseline.json`, only goes down: lower
  it with `UPDATE_AXE_BASELINE=1` on `e2e/accessibility.spec.ts` and
  `e2e/accessibility-setup.spec.ts` when violations fall.

## Reading a failure

- Each failed screen leaves `-expected`, `-actual` and `-diff` images in
  `test-results/` (the visual-diffs and rewind-visual-diffs artifacts in
  CI). Open them with `npx playwright show-report`; changed pixels are red.
- A diff you cannot explain from your own change is a regression.

## Quick looks

- The committed `chrome-devtools` MCP server (`.mcp.json`, headless) is for a
  quick look at a running page; it needs a local Chrome. Tests still use
  Playwright.
