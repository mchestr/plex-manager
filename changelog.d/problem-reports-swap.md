### Upgrade notes

- **Database:** this release adds `replacedAt` to the problem report fix ledger (`ProblemFixLedger`), which the breaker for fixes that replace files counts. The migration runs at start (or with `npm run db:deploy`).

### Added

- **Problem reports, Swap the copy:** the server admin can swap a copy that won't start, or is wrong in a way a better copy wouldn't fix, for another release of the same quality or better from Radarr's or Sonarr's interactive search. The copy members have keeps playing until the new one imports, and the old release is then blocklisted. With no such release, nothing changes and the report says why.
- **Problem reports, Remove the file and search:** for a copy whose only other copies are lower quality, the server admin can delete the file and search for any copy the quality profile allows, behind a confirm that says which release is blocklisted, whether Radarr or Sonarr keeps the file in a recycle bin, and whether Plex may bring the title back as a new item.
- **Problem reports, the breaker:** both fixes count toward the breaker for fixes that replace files (5 an hour, 15 a day), and admins with a linked Discord get a DM when it trips.
