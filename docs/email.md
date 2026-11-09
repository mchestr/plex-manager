# Email

The app can send email through an SMTP mail server. Email is off until an
operator sets `SMTP_URL` and `EMAIL_FROM`. While it is off, the app sends
nothing and no page changes for members.

Today the app sends one kind of email: the test email that an admin sends to
themselves from **Admin > Settings > Email**.

## Set up

Environment variables set up the mail server. There is no settings form, so
the login never goes into the database. Set the same variables on the web
containers and on the worker: the web shows the status and can send the test
email without Redis, and with Redis only the worker connects to the server.

| Variable | Needed | Meaning |
| --- | --- | --- |
| `SMTP_URL` | Yes | The mail server, with no login in it, such as `smtp://smtp.example.com:587` |
| `EMAIL_FROM` | Yes | The sender address, such as `noreply@example.com`. The display name is the server name. |
| `SMTP_USER` | With a login | The login of the mail server |
| `SMTP_PASSWORD` | With a login | The password. Set it from a secret store, never in a committed file. |
| `EMAIL_REPLY_TO` | No | Where replies go. It is also the envelope sender, so bounce notices go here. |
| `EMAIL_POSTAL_ADDRESS` | No | The sender's postal address, in the footer of every email |

1. Get an SMTP login from your mail provider. Use a login for this app only.
2. Make sure that the provider lets you send from the `EMAIL_FROM` address.
   Many providers send only from an address or a domain that you verified.
3. Set the variables on every container.
4. Restart the containers.
5. Open **Admin > Settings > Email** and check the status.
6. Click **Send a test email**, and look for it in your inbox.

Each value is checked at boot. A problem writes an `env.warning` line to the
log. The boot does not stop, because email is optional. These problems stop
all email until you fix them:

- `SMTP_URL` is not `smtp://` or `smtps://` with a host.
- `SMTP_URL` is set and `EMAIL_FROM` is not.
- `EMAIL_FROM` or `EMAIL_REPLY_TO` is not one plain address.
- Only one of `SMTP_USER` and `SMTP_PASSWORD` is set.

One problem does not stop email: `SMTP_URL` holds a user name or a
password. The app ignores that login and sends without it, so a server that
needs a login refuses the email. Put the login in `SMTP_USER` and
`SMTP_PASSWORD`. The Email section shows this problem as a warning.

## TLS and the login

- `smtps://` uses TLS from the start. The default port is 465.
- If the server offers STARTTLS, `smtp://` moves to TLS after it connects.
  The default port is 587.
- With a login, `smtp://` requires STARTTLS. If the server does not offer it,
  the send fails and the password never goes over the network as plain text.

## The Email section

**Admin > Settings > Email** is in the Connections group. It is read only.

- **Not set up:** the section names the variables to set.
- **Needs setup:** a variable is wrong. The section names it and says why.
- **Set up:** the section shows the host and port, the security, the sender,
  the Reply-To address, and whether a login and a postal address are set. It
  never shows the user name, the password or the postal address. A problem
  that does not stop email shows as a warning above these rows.

**Last test** at the bottom shows the newest test email: when, who sent it,
and the result. It links to the audit event.

## The test email

**Send a test email** sends one email to your own address on file. The
subject starts with `[Test]`. The footer is the same as the footer of every
other email: the server name, the postal address and a way to contact you.

- With Redis, the action adds an `EMAIL_TEST` job, and the worker sends the
  email. Refresh the page after a moment to see the result in **Last test**.
- Without Redis, the action sends the email at once, and shows a failure in
  a message.
- An admin can send 30 test emails in 10 minutes (the `admin:test` limit).
- Your account must have an email address. Plex sign-in reads it from
  plex.tv.
- Each test writes one `EMAIL_TEST_SENT` audit row (category Settings). It
  holds the status, the SMTP reply code and the failure class. It never holds
  the address.

## What a sent email means

A sent email means that the mail server accepted it with a `250` reply. It
does not mean that the email reached the inbox. The provider can still
bounce it, drop it, or put it in a spam folder. With `EMAIL_REPLY_TO` set,
bounce notices go to that address.

When a send fails, the app sorts the failure into a class from the SMTP step
and the RFC 3463 status code:

| Server reply | Class |
| --- | --- |
| `5xx` to `RCPT TO` with a mailbox code (`5.1.1`, `5.1.2`, `5.1.10`, `5.2.1`) | `rejected`: the address cannot receive mail |
| Any other `5xx`, a refused login, or no TLS where the login needs it | `refused`: fix the set-up |
| `4xx`, or a refused or dropped connection | `temporary`: try again later |
| No answer within the time limit | `timeout` |

A send has a time limit of 60 seconds. When the limit ends, or the worker
stops, the app closes the connection, so the server does not get the rest
of the message. If the whole message went out and only the last reply is
late, the server can still have taken it. SMTP has no way to tell, so a
`timeout` or `temporary` result can, in rare cases, still mean a delivered
email.

## Logs

The mail code logs under `EMAIL`. A line holds the user id, the class, the
SMTP reply code, the status code and the SMTP step. It never holds an
address, the server's reply text or the login.

| Event | Level | When |
| --- | --- | --- |
| `email.sent` | info | The server accepted an email |
| `email.send_failed` | warn | A send failed |
| `email_test.sent` | info | A test email was sent |
| `email_test.not_sent` | warn | A test email was not sent, with the status |
