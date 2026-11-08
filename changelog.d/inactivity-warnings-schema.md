### Upgrade notes

- **Inactive members:** this release adds the `InactivityNotice` table and new columns on `User`, `InactivitySettings` and `InactivityRun`, for the coming warning emails before removal. The migration only adds, so it needs no other step. Nothing reads the new fields yet, and removal works as before.
