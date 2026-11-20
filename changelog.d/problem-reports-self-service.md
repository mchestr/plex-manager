### Upgrade notes

- **Database:** this release adds members' swaps to the problem report settings (`ProblemReportSettings`: the mode, when it last changed and three limits) and the title to each fix ledger row (`ProblemFixLedger.titleKey`), filled in from each row's report. Members' swaps start Off. The migration runs at start (or with `npm run db:deploy`).
- **Members' swaps:** run Dry run for a couple of weeks and read each "Dry run" step on the reports before you choose On. On needs a recycle bin in Radarr and in Sonarr (Settings > Media Management), so a bad swap can be undone.

### Added

- **Problem reports, members' swaps:** with members' swaps On (Automations > Problem reports, settings), a member can swap a copy that won't play right, looks filmed off a screen or has subtitles stuck on, from `/report` (in Discord, only the last two, since Discord doesn't ask about the member's player), and a report that a different title plays fixes the Plex match on its own when Radarr or Sonarr has another title for the file (within the server's Plex changes an hour, and for every member: a match changes no file). A member gets 3 swaps in any 7 days, members can swap a title once every 14 days, and the server allows 10 members' swaps a day; the server admin can change all three. A member swaps only titles they played in the last 30 days or are watching, and the sheet says how many swaps they have left, or why the report goes to the server admin instead. Swaps need approval on a member's admin page sends that member's swaps to the server admin.
- **Problem reports, Dry run:** members' swaps can run as far as finding the other copy, then go to the server admin, who sees the release it would grab and runs it in one tap. Members see the report as with the server admin throughout.
- **Problem reports, Does it play now?:** after a swap or a removal brought in a new copy, the member who reported it can say, within 7 days, whether it plays. Still broken puts the report back with the server admin with what's still wrong, and never starts another swap.

### Changed

- **Problem reports, one-tap fixes:** a swap or a removal an admin starts gives up after 15 minutes if the title is still playing or downloading, instead of a day, and stops if that admin is no longer an admin when it acts. Turning problem reports off now stops only runs that haven't acted yet; one waiting on a new copy keeps going.
