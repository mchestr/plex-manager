# Releasing

How a Plex Manager release is cut. Versions follow
[Semantic Versioning](https://semver.org/), and `CHANGELOG.md` carries each
release's notes in the [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
format. Only the owner pushes `v*` tags; `main` stays behind branch protection
the whole time.

## What a release produces

| Pushed | Image tags (`ghcr.io/mchestr/plex-manager`) | GitHub Release |
|---|---|---|
| a merge to `main` | `latest`, `main`, `sha-<short>` | none |
| the tag `v0.4.0` | `0.4.0`, `0.4` | `v0.4.0`, from the `## [0.4.0]` section |
| the tag `v0.4.0-rc.1` | `0.4.0-rc.1` | `v0.4.0-rc.1`, marked as a prerelease |

`docker-publish.yml` builds the tags through the metadata action's semver
patterns, and the image's `org.opencontainers.image.version` label is the
version. `/api/metrics` reports `package.json`'s version in
`plex_manager_build_info`.

## Day to day: the changelog check

Every pull request adds its lines under `## [Unreleased]`, in the Added,
Changed, Fixed, Security or Removed subsection, and puts anything an operator
must do under `### Upgrade notes`. That block always starts with "Take a
`pg_dump -Fc` before you start the new release".

The **Changelog** check (`.github/workflows/changelog.yml`, rules in
`scripts/release/changelog.mjs`) fails a pull request that touches
`prisma/migrations/**`, `lib/env.ts`, `docker-entrypoint.sh`, `Dockerfile` or
`deploy/**`, or carries the `breaking` label, and adds no line under
Unreleased. The `no-changelog` label skips it. Run it locally with
`node scripts/check-changelog.mjs --base origin/main --head HEAD`.

## Cutting a release

1. **Prepare.** On an up-to-date `main` with a clean tree, run
   ```bash
   node scripts/release/prepare.mjs 0.4.0
   ```
   It refuses a version that is not greater than `package.json`'s and every
   version in the changelog, an empty Unreleased section, and one without an
   upgrade-notes block that starts with a `pg_dump`. Otherwise it bumps
   `package.json` and `package-lock.json`, moves Unreleased under
   `## [0.4.0] - <today>` with a new empty Unreleased above it, updates the
   link definitions, commits on `release/v0.4.0`, pushes, and opens the PR
   `chore(release): v0.4.0` with the notes in its body. `--date YYYY-MM-DD`
   sets the date; `--no-pr` only edits the files.
2. **Merge** the release PR once Checks pass. Edit the notes in the PR if they
   need it; the release uses what merges.
3. **Tag** the merge commit on `main`:
   ```bash
   git switch main && git pull
   git tag -a v0.4.0 -m "v0.4.0" && git push origin v0.4.0
   ```
4. **Publish.** The tag starts two workflows:
   - `docker-publish.yml` pushes `0.4.0` and `0.4`;
   - `release.yml` checks that the tag equals `v` plus `package.json`'s
     version, waits up to 90 minutes for the "Checks" run on that commit as a
     push to `main` and requires it, Schema Drift and Build included, to have
     passed, then runs `gh release create v0.4.0 --notes-file <the 0.4.0 section>`.
     If Checks failed or took longer, fix `main` or wait, then re-run the
     workflow; a tag that does not match `package.json` needs a new release PR.
5. **Check** that `ghcr.io/mchestr/plex-manager:0.4.0` exists and that the
   release page shows the section with its upgrade notes.

## Trying the flow on a fork

On a fork with Actions enabled, run `node scripts/release/prepare.mjs
0.0.1-test --no-pr` after adding a line under Unreleased, commit it to the
fork's `main`, wait for Checks, then push `v0.0.1-test`. The fork gets a
prerelease `v0.0.1-test` and the image `ghcr.io/<fork owner>/plex-manager:0.0.1-test`.

## Rolling back

Prisma has no down migrations. To roll back an upgrade, stop the app, restore
the dump taken before it (`docs/operations.md`, "Restore"), and start the
previous version's tag, never `latest`. The README's "Upgrading" checklist has
the full upgrade path.
