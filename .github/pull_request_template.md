## Summary

<!-- What this changes and why. Link the issue and the plan step id. -->

## Checklist

- [ ] Matches the reference mockup or the components sheet; visual diff attached
- [ ] `npm run design:check` passes; any new allowlist entry in `scripts/design-system/allowlist.mjs` says why
- [ ] New interactive elements have a `data-testid`
- [ ] Golden snapshot changes reviewed by the owner (`evals/rewind/fixtures/**`, `evals/rewind/profiles/**`, `evals/rewind/__tests__/__snapshots__/**`)
- [ ] Touches `.claude/skills/**` or `.mcp.json`: `/security-review` run
- [ ] Changes code a project skill describes (`rewind-design-system`, `rewind-page`, `share-card`, `visual-qa` in `.claude/skills/`): the skill is updated
