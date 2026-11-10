### Upgrade notes

- **Discord commands:** run `register-discord-commands` after you deploy (`npm run register-discord-commands`, or `node scripts/dist/register-discord-commands.cjs` in the image), so Discord shows `/report` and stops offering `/mark badquality`.

### Added

- **`/report` in Discord:** members can report a problem with a title from Discord, with the same steps as the web: choose the title, what kind of problem and which one, then send it to the server admin. A show, and "Something else", continue on the web. `/watching` has a Report a problem button on each stream while problem reports are on.

### Removed

- **`/mark badquality`:** `/report` replaces it. Earlier poor-quality marks stay, and `/mymarks type:badquality` still lists them.
