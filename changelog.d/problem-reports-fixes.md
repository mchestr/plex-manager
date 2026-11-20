### Upgrade notes

- **Database:** this release adds the problem report fix ledger (`ProblemFixLedger`) and two columns on `ProblemReport` and one on `ProblemReportSettings`. The migration runs at start (or with `npm run db:deploy`).

### Added

- **Problem reports, missing episodes:** a member who reports missing episodes gets an answer when they haven't aired or aren't on the server (with a link to request them), and otherwise Sonarr looks for them, or Plex scans for files Sonarr already has. Nothing is removed.
- **Problem reports, one-tap fixes:** the server admin can run Look for the episodes or Refresh the details from a report. Fixes run in the job queue, within a daily search cap, and a breaker for fixes that replace files.
- **Problem reports, DMs:** members who made or follow a report get a Discord DM when it is fixed or closed, during the day in their zone.
