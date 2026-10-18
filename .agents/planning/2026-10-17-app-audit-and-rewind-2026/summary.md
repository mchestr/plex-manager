# Summary: Full App Audit, UI Refresh and Rewind 2026

Output of the 2026-10-17/18 planning effort for: _"a full audit and UI refresh for
the app to make it consistent, modern and clean ... security issues, improvements,
code deduplication, best practices we are not following ... make the Rewind way
better ... better visuals, better stats, more robust, newer models ... research
skills we can use to help generate visuals better."_

## Artifacts created

```
.agents/planning/2026-10-17-app-audit-and-rewind-2026/
├── rough-idea.md                          the original request and scope
├── research/
│   ├── security-audit.md                  57 findings (SEC-01..57)
│   ├── best-practices-and-ops.md          39 findings (BP-01..39)
│   ├── code-duplication.md                16 findings (DUP-01..16)
│   ├── ui-ux-audit.md                     46 findings (UI-01..46), from 159 screenshots
│   ├── rewind-pipeline-audit.md           22 findings (RWP-01..22) + full stat inventory
│   ├── rewind-visuals-audit.md            14 findings (RWV-01..14) + slide inventory
│   ├── additional-findings.md             47 findings (GAP-01..47) from a completeness sweep
│   ├── visual-generation-skills.md        agent skills / MCP tooling for visuals (fact-checked)
│   ├── rewind-inspiration.md              2025 year-in-review survey + ~75-stat catalogue
│   ├── llm-and-generative-models-2026.md  model matrix, costs, provider architecture
│   └── modern-ui-stack-2026.md            stack choices and migration path
├── design/
│   ├── ui-design-system.md                app-wide design system (tokens, components, migration)
│   ├── rewind-2026-design.md              Rewind 2026 "The Annual": experience + system design
│   └── mockups/{ui,rewind}/               HTML mockups + rendered PNGs (fonts, sources)
├── implementation/
│   ├── plan.md                            181 test-driven steps in 12 phases + traceability
│   └── issues-backlog.md                  /create-issues input, one item per step
└── summary.md                             this document
```

## How it was produced

- **Screenshots first.** The app was booted locally with seeded data and a
  completed Rewind, and every page and Rewind slide was captured at 1440x900 and
  390x844. The UI auditors worked from those screenshots as well as the code.
- **Audit with verification.** Fourteen scoped auditors covered security, best
  practices, operations, duplication, UI and Rewind, plus a completeness critic
  that found five more areas. A verifier re-checked every finding against the
  code. Critical and high findings also had to survive an independent attempt
  to refute them, with a tie-breaker when the two disagreed. Claims that did not
  hold up are listed in each report's "ruled out" appendix.
- **Web research, fact-checked.** Four research reports were each re-checked by
  a second agent against primary sources: npm and SDK packages, GitHub repos,
  vendor docs and the claude-api skill. 58 corrections were applied in place.
- **Judge panels for both designs.** Three designers each mocked a different
  direction as real HTML, rendered to PNG. Three judges scored the candidates
  through separate lenses, the winner was synthesised with the runners-up's best
  ideas grafted in, and the result was reviewed against the audits. A final pass
  reconciled the two design docs on every shared contract.
- **Plan with coverage enforced in code.** An automated check refused the plan
  skeleton until all 241 findings were assigned to a step or deferred with a
  reason. Writers drafted each phase, a generator assembled `plan.md`, and two
  critics reviewed the result (sequencing/schedule and technical accuracy). All
  43 review issues were applied.

## What the audit found

241 verified findings: **2 critical, 27 high, 120 medium, 87 low, 5 info.** The
two criticals are the same issue, reported by two audits.

**Fix this week (all in Phase 0):**
- **Next.js and the image optimizer (SEC-01 / BP-01).** `next@16.1.1` is 38
  advisories behind, including RCE and SSRF in the image optimizer. On top of
  that, `images.remotePatterns` allows any host over http and https, so anyone
  can use the optimizer. Upgrade to 16.4.2 or later, and set
  `images.unoptimized` (every `next/image` already passes `unoptimized`).
- **CI publishes untrusted code (SEC-02 / BP-02).** `docker-publish.yml` builds
  unmerged pull-request code, including forks, and pushes it to GHCR as
  `:latest` and `:main`.
- **Admin account takeover (SEC-08).** Jellyfin sign-in links accounts by email
  on an unverified identifier, so a Jellyfin user can take over any account,
  the admin's included.
- **Rewind share links leak other members' data (SEC-16, RWP-01, RWV-05).**
  Public links expose other members' names and watch time, and they can never
  be revoked. A separate bug makes every share link return 404 after about 50
  views.
- **No limit on paid generation (SEC-22).** There is no rate limit, lock, year
  bound or spend cap on paid LLM generation.
- **E2E wipes real databases (BP-07).** The E2E suite wipes whatever database
  `.env` points at.
- **Discord bot flaps (BP-12).** With default settings the bot drops offline
  every minute.
- **Jellyfin 12.0 sign-in fails (GAP-01).** Login on Jellyfin 12.0 servers fails
  because the legacy auth header is off by default.
- **Plex tokens reach the browser (SEC-18).** Admin invite pages send every
  invitee's `plexAuthToken` to the browser.

**Broken flows:**
- Discord linking can't be reached from any page (UI-01).
- In January the viewer can't open the Rewind it just generated, and there is no
  archive of past years (RWP-04, RWV-02, UI-02).
- Setup can't be finished unless every optional service passes a live
  connection test (UI-03).
- On mobile, the admin assistant panel can't be closed (UI-04).

**Wrong Rewind statistics:**
- Per-title leaderboards always read zero (RWP-05).
- Declined Overseerr requests count as approved (RWP-06).
- Hour and day patterns are bucketed in UTC (RWP-03).
- Two of the twelve archetypes can never win (RWP-18).
- The LLM is trusted to produce numbers, such as top genre and "binge watcher".

**Code health:**
- 4.43% of the code is duplicated (187 clones).
- 26 files (3,107 LOC) are never imported by the app, kept alive by about 6,400
  LOC of tests, and about 1,150 LOC of exported functions in live modules are
  dead.
- There are two hand-written OpenAI clients and three Tautulli HTTP layers.
- Stored Rewind data has no runtime schema.
- About 130 copies of auth/try-catch boilerplate use three different result
  shapes.

**UI consistency:**
- There are four unrelated visual languages.
- The code has 2,165 raw `slate-*` utilities.
- The existing `Card` primitive is used 4 times, against 162 hand-copied panels.
- Pinch-zoom is disabled.
- Contrast fails AA widely, and the existing axe gate can't detect it.

## Design decisions

**UI design system:** *Quiet Precision* won a close judging round (228, 226,
214), with the runner-up's poster-led member surfaces grafted in.
- **Look:** graphite neutrals (canvas `#1a1c1e`) and a single Plex-amber accent
  used only for the next action, location and focus.
- **Type:** IBM Plex Sans and Mono.
- **Tokens:** OKLCH semantic tokens mapped 1:1 to shadcn names, on shadcn/ui with
  Base UI primitives generated into `components/ui`.
- **Accessibility:** every text pair measures 4.5:1 or better in dark and light.
  Dark ships first; light comes later behind a flag.
- **Rewind:** lives in a scoped `[data-theme="rewind"]`.
- **Guardrails:** a CI ratchet bans raw palette classes, gradient text, arbitrary
  hex and caps eyebrows.
- **Branding:** "{Server name} Rewind 2026", never "Plex Rewind" (Plex now
  publishes its own platform-wide report under that name).
- **Mockups:** `design/mockups/ui/png/`.

**Rewind 2026:** *"The Annual"* (kinetic-editorial, which won 239 vs 208 vs 203).
- **Format:** each member gets an 18-page issue of their own film magazine in
  six acts, about 2 minutes 20 seconds. A 6-page pocket edition serves light
  viewers.
- **Pages:** twelve print-ink fields with every text pair at 7:1 or better, and
  width-fitted Archivo type, so long titles condense instead of truncating.
- **Story player:** tap zones, swipe, keyboard, and a pause control.
- **Interactions:** a guess-your-top-show quiz and a monthly ranking race.
- **Share cards:** per-page 9:16 cards rendered through `next/og`, built only
  from a share-safe projection. Sharing is opt-in, revocable and expiring.
- **Stats engine v3:** year-scoped history in the member's time zone, a metadata
  cache for genres and people, corrected Tautulli and Overseerr readings, and
  versioned Zod data.
- **Generation:** runs as BullMQ jobs, with a token-only final cut on 1 January.
- **Mockups:** `design/mockups/rewind/png/`.

**Models and AI architecture** (from the fact-checked research):
- **Facade:** one provider-agnostic layer on the Vercel AI SDK (`ai@7`).
- **What the LLM does:** it only writes short copy around `{{fact:id}}` tokens.
  Grounding rejects digits and unknown names, with a cheap repair pass and then a
  deterministic template fallback.
- **Default model:** chosen by a November bake-off between `claude-sonnet-5-5`
  and `gpt-6.1-sol`, at about $0.02 per member.
- **Repair and economy model:** `claude-haiku-5-5` or `gpt-6-luna`.
- **Self-hosters:** OpenAI-compatible endpoints such as Ollama are supported.
- **No runtime image or video generation.** Per-user AI images are too costly,
  and studio artwork raises copyright problems. `gpt-image-1` retires on
  2026-10-23, and the Sora API has shut down.

**Agent skills for better visuals** (answering the research question):
- **Vendor these into `.claude/skills/`, pinned to commits:**
  - Anthropic `frontend-design`;
  - Vercel `web-design-guidelines` (patched to read a local copy of its rules),
    `react-best-practices`, `composition-patterns` and `react-view-transitions`;
  - Motion's `motion` skill.

  Cloud sessions load committed skills but do not install plugins, so vendoring
  is the only option that works everywhere.
- **Add Playwright visual regression** (`toHaveScreenshot`), plus four
  project-authored skills: `rewind-design-system`, `rewind-slide`, `share-card`
  and `visual-qa`.
- **Image generation at dev time only:** use one first-party image MCP at user
  scope (fal or BFL FLUX) to make the fixed asset set.
- **Remotion** stays a stretch goal. It needs a second, frame-driven component
  tree and has a source-available license.

## Implementation plan in brief

`implementation/plan.md` has **181 steps (187 PRs) in 12 phases, from 2026-10-19
to 2027-02-24.** The work runs in three lanes (Rewind, UI, hardening) with at most
two open PRs each and a review budget of about 18 units a week.

| Phase | Window | Steps |
|---|---|---|
| P0 Safety fixes on the current code | 10-19 to 10-27 | 20 |
| P1 Baselines, guardrails and CI gates | 10-20 to 11-03 | 10 |
| P2 Rewind data layer and AI foundations | 10-22 to 11-09 | 17 |
| P3 UI foundations: tokens, fonts and primitives | 10-26 to 11-05 | 10 |
| P4 Security and reliability hardening | 10-23 to 12-03 | 18 |
| P5 Rewind core experience and model bake-off | 11-06 to 11-20 | 13 |
| P6 Shells and the member pages Rewind needs | 11-06 to 12-04 | 5 |
| P7 Rewind breadth, admin tooling and soft launch | 11-10 to 12-04 | 17 |
| P8 Freeze, season open and ship window | 11-30 to 12-11 | 8 |
| P9 Monitor and final cut | 12-15 to 2027-01-02 | 3 |
| P10 UI refresh after Rewind | 2027-01-04 to 02-19 | 28 |
| P11 Platform, ops, privacy, Jellyfin parity, locale and docs | 2027-01-04 to 02-24 | 32 |

**Key dates:**
- 10-23: Phase 0 safety fixes shipped.
- 10-30: baselines and CI gates in place.
- 11-06: Rewind data layer complete.
- 11-20: core experience done and default model chosen.
- 11-27: gallery sign-off and admin soft launch.
- 12-01: model freeze and season open.
- 12-10: feature freeze.
- 12-12: Rewind ship complete.
- 12-14: code freeze.
- 12-28: final-cut dry run.
- 2027-01-01/02: final cut.

Every finding is traced to its step in Appendix A. 240 are assigned; RWV-14 (an
optional sound layer, info) is deferred. All Rewind requirements (FR-1..51,
NFR-1..14) are mapped in Appendix D.

## Judgment calls to review

These were made in planning to keep the pre-season schedule deliverable. Each is
recorded in plan.md Appendix C with a default and a decide-by date.

- **Watchlist sync moves to January (GAP-02, high, now P11.28).** It is a
  correctness bug, since sync most likely requests nothing while reporting
  success, not a security issue. Pull it forward if members rely on it.
- **The setup-claim hardening moves to January (SEC-30, medium, now P11.32).**
  It only matters for a fresh install exposed to the internet before its setup
  wizard is finished.
- **The review budget is about 18 units a week, not 12 (decision 30).** Rewind's
  P0 scope alone needs about 10 a week, so a smaller budget means cutting Rewind
  pages up front.
- **Final-cut batch adapters are dropped for 2026 (decision 31).** They saved
  about $0.05 per 100 members.
- **SEC-01's severity is disputed (critical vs high).** It depends on whether the
  locked libheif build is affected. Either way it is the first fix.

## Decisions needed from you this week

plan.md Appendix C lists 31 decisions, each with a planned default that applies
if no answer arrives. The earliest ones are due between 2026-10-20 and
2026-10-23:
- **Decision 1:** season timing (open 2026-12-01 with data through 30 November,
  as designed).
- **Decision 5:** optional per-member time zones.
- **Decision 24:** rate limits on installs without Redis.
- **Decision 21:** date style (en-US vs en-GB).
- **Decisions 22 and 28:** moving the non-Rewind admin and member pages to
  January.
- **Decision 30:** review capacity.

Also see the **owner calendar** in plan.md. On Monday morning, disable
`docker-publish.yml` and merge P0.3 and P0.4 before anything else.

## Suggested next steps

1. Skim `design/mockups/*/png/`, then confirm or change the week-one decisions
   above.
2. Run `/create-issues --all` and point it at
   `implementation/issues-backlog.md`. It creates the 48 `[READY]` items, which
   are the steps whose window starts within two weeks (by 2026-10-30). Each
   Friday, mark the next two weeks' items `[READY]` and run it again. The
   backlog's header explains this and lists the labels to create first.
3. Start with P0.3 and P0.4 (the day-0 rules), then P0.1 (the Next.js upgrade),
   using `/implement-issue`.
