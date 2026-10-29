### Changed

- **Database for affiliate invites:** the database gets the tables and columns for affiliate invites. The feature is not in the app yet, so nothing changes for members or admins. The new optional variable `RETENTION_AFFILIATE_DAYS` (default 365) sets how many days ended affiliate applications and unused affiliate invites are kept. The next boot runs one automatic pass that re-encrypts the stored secrets, because a new secret column is added.
