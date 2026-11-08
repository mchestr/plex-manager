### Upgrade notes

- **New optional variable:** `RETENTION_INACTIVITY_NOTICE_DAYS` (default 180) sets the age in days after which the app deletes a warning email record, once the member's inactive period is over. Records of an open inactive period stay at any age. See `docs/privacy.md`.

### Changed

- **Inactive members:** the sweep now plans warning emails and holds a removal until the member's warnings are done. Warning emails stay off, and nothing can turn them on yet, so removals work as before.
