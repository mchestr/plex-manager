# Changelog fragments

Each pull request that needs a changelog entry adds one file here instead of
editing `CHANGELOG.md`, so pull requests never conflict over the changelog.
`node scripts/release/prepare.mjs <version>` merges every fragment into the
new version's section of `CHANGELOG.md` and deletes them.

Name the file after the change, such as `markdown-tables.md`. Write only
`### ` subsections from this list, in any order: `Upgrade notes`, `Added`,
`Changed`, `Deprecated`, `Removed`, `Fixed` and `Security`. Put a list item
under each one, worded as in `CHANGELOG.md`:

```markdown
### Upgrade notes

- **New variable:** set `EXAMPLE_URL` before you start the release.

### Added

- **Example page:** what changed, for an operator or a member.
```

Leave out the `pg_dump` item: every release's upgrade notes start with it.

The **Changelog** check (`.github/workflows/changelog.yml`, rules in
`scripts/release/changelog.mjs`) fails a pull request whose fragment does not
follow these rules, and one that touches `prisma/migrations/**`, `lib/env.ts`,
`docker/entrypoint.sh`, `Dockerfile` or `deploy/**`, or carries the `breaking`
label, without adding a fragment. The `no-changelog` label skips the second
part. Run it locally with
`node scripts/check-changelog.mjs --base origin/main --head HEAD`.
