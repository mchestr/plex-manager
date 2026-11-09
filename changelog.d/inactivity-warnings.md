### Upgrade notes

- **Warning emails:** `EMAIL_REPLY_TO` is also the envelope sender, so your mail provider must accept it as a sender. Set it before you send the test email.
- **Warning emails:** before you go back to a release older than the removal gate, turn automatic removal off. An older release ignores the removal dates the emails named and removes overdue members at once. Before you turn the emails on, follow the launch checklist in `docs/inactive-members.md`.

### Added

- **Inactive members:** warning emails before removal, 30, 7 and 1 days before by default, in a new Warning emails card. They are off until an admin turns them on, and they need email and Redis set up. The page alerts when warnings cannot go out, when warnings failed, and when the safety limit holds back members who wait.

### Changed

- **Inactive members:** with warning emails on, the run removes a member only after their last warning. A member with no warning yet gets 30 days first. While they are on, a new number of days without a play must be at least twice the largest number of days before removal. Turning the emails off lets the next run remove members who have no sent warning yet, so turn automatic removal off first to stop removals.

### Fixed

- **Logs:** a line logged by a queue job, or by a route with no signed-in user, keeps the `userId` that the code logs, so the warning email lines name the member.
