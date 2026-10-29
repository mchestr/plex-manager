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

## Day to day: changelog fragments

Pull requests never edit `CHANGELOG.md`, so they never conflict there. Each
one adds a fragment, `changelog.d/<topic>.md`, with its Added, Changed,
Deprecated, Removed, Fixed or Security items, and anything an operator must do
under `### Upgrade notes`. [`changelog.d/README.md`](../changelog.d/README.md)
has the format. A fragment leaves out the `pg_dump` item: the release adds
"Take a `pg_dump -Fc` before you start the new release" as the first upgrade
note.

The **Changelog** check (`.github/workflows/changelog.yml`, rules in
`scripts/release/changelog.mjs`) fails a pull request whose fragment is
malformed or that adds an `## [Unreleased]` section to `CHANGELOG.md`. It
also fails one that touches `prisma/migrations/**`, `lib/env.ts`,
`docker/entrypoint.sh`, `Dockerfile` or `deploy/**`, or carries the
`breaking` label, and adds no fragment; the `no-changelog` label skips that
part. Run it locally on committed work with
`node scripts/check-changelog.mjs --base origin/main --head HEAD`.

## Cutting a release

1. **Prepare.** On an up-to-date `main` with a clean tree, run
   ```bash
   node scripts/release/prepare.mjs 0.4.0
   ```
   It refuses a version that is not greater than `package.json`'s and every
   version in the changelog, an empty `changelog.d/`, and a malformed
   fragment. Otherwise it bumps `package.json` and `package-lock.json`,
   merges the fragments, in file-name order, into `## [0.4.0] - <today>`
   (each subsection once, upgrade notes first and opening with the `pg_dump`
   item), adds the tag's link definition, deletes the fragments, commits on
   `release/v0.4.0`, pushes, and opens the PR `chore(release): v0.4.0` with
   the notes in its body. `--date YYYY-MM-DD`
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
0.0.1-test --no-pr` after adding a fragment to `changelog.d/`, commit it to the
fork's `main`, wait for Checks, then push `v0.0.1-test`. The fork gets a
prerelease `v0.0.1-test` and the image `ghcr.io/<fork owner>/plex-manager:0.0.1-test`.

## Rolling back

Prisma has no down migrations. To roll back an upgrade, stop the app, restore
the dump taken before it (`docs/operations.md`, "Restore"), and start the
previous version's tag, never `latest`. [Operations](operations.md#roll-back)
has the exact steps.
