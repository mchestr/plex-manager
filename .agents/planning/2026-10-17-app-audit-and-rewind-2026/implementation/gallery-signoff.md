# Rewind 2026 gallery sign-off (P7.16)

The owner's checklist for the gallery review and the admin soft launch. Fill it
in during the review on 2026-11-25 and 2026-11-27; P8.1 tags the signed-off
commit. Log every issue as a GitHub issue labelled `rewind-signoff` with P0, P1
or P2. Every P0 is fixed before 27 November; a P1 moves into P8's window or its
page is cut through `rewindDisabledPages`.

**Hard cutoff for sign-off fixes: 12:00 on Monday 2026-11-30, server time.**

## Release candidate

| Item | Value |
|---|---|
| Commit on main (release cut, 2026-11-24) | |
| CI run id (unit, golden, visual, axe, perf, E2E all green) | |
| `npm run eval:rewind` offline checks on the selected recordings | |
| `npm run rewind:gallery` run on | |

## Gallery review (`/admin/rewind/gallery`, phone and desktop)

- [ ] Each page matches its mockup and design 4.3
- [ ] Archetype names and long titles never break inside a word
- [ ] Title cards wherever art is missing; the `tz.note` wording reads right
- [ ] Privacy lines are right; unsigned cards print no name
- [ ] Pocket edition and postcard, including P7.3's habit rule
- [ ] Cut decisions recorded below for People, Setup and Next year

| Page | Keep or cut | Notes |
|---|---|---|
| 08 People | | |
| 13 Setup | | |
| 17 Next year | | |

## Production preflight

- [ ] `pg_dump` taken before the deploy
- [ ] Deployed through P1.10's path (entrypoint migrations, P4.17's image)
- [ ] P4.16 redaction live: a share link and an invite opened, logs searched for unmasked tokens
- [ ] `/admin/rewind` preflight green: Redis, Tautulli 2.17 or later, the model in `model-selection.md`, no model retiring before 2027-01-02
- [ ] P0.20's strip script run, and a second run reports zeros

## Turn on (Rewind settings section)

- [ ] `rewindEnabled` on and `rewindAudience = admins` (on since the 2026-11-20 admin runs)
- [ ] `rewindLlmMode = standard`, budget at its season value
- [ ] Each change wrote `CONFIG_CHANGED`

## Generate and verify on real data

- [ ] Prepare season, then Generate all, from `/admin/rewind`
- [ ] Every admin's issue completes, at under $0.03 per member (NFR-9)
- [ ] Each admin opens their issue on an iPhone, an Android phone and a desktop browser
- [ ] A share link is created, unfurled in Discord, rotated and revoked
- [ ] The ready DM arrives inside the window, and `RewindView` rows appear
- [ ] A member account sees no Rewind card while the audience is `admins`

## Sign-off issues

| Issue | Priority | Status |
|---|---|---|
| | | |

## Sign-off

- [ ] No P0 `rewind-signoff` issue is open
- [ ] Every sign-off fix merged by 12:00 on 2026-11-30

Signed off by: ____________  Date: ____________

Rollback: turning `rewindEnabled` off hides `/rewind` and the home card at once, with no data lost.
