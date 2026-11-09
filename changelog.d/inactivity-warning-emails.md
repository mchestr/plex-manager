### Added

- **Email:** the warning emails before the inactivity sweep removes a member: a first warning, reminders and a last warning, each sent between 09:00 and 20:00 in the member's zone. Warnings stay off, so no member gets one yet. A failed warning logs `inactivity_notice.failed`. See `docs/email.md`.
- **Email:** the test email now shows the first warning, with example dates.

### Changed

- **Email:** a mail server certificate that fails the check (expired, self-signed, or for another host) now counts as `refused`, not `temporary`, so a send is not tried again with the same certificate.
