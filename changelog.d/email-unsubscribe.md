### Added

- **Email:** one-click unsubscribe (RFC 8058) for the access reminders, the coming warning emails before removal for inactivity. A link only turns the emails off and needs no sign-in. The test email now carries the unsubscribe link and the `List-Unsubscribe` headers, so you can try them.
- **Account:** an Email card with an Access reminders switch. It shows only while email is set up and the warning emails are on.

### Upgrade notes

- **Unsubscribe links:** mail providers post to `/api/email/unsubscribe` from their own servers, and members open `/email/unsubscribe` from the email. If a CDN or a firewall in front of the app blocks countries or challenges bots, let both paths through. A new `NEXTAUTH_SECRET` stops every unsubscribe link already sent. See `docs/email.md`.
