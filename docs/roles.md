# Roles and permissions

Access has two tiers. `User.isAdmin` is the superuser and holds every
permission. A non-admin can also hold one built-in role in `User.role`;
today that is **Support**, for people who troubleshoot with the admin
assistant but must not be able to change the install.

Roles are fixed in code (`lib/permissions/index.ts`), so a new role or
permission needs no schema change. An unknown stored role grants nothing.

## Support

| Permission | Support | What it allows |
|---|---|---|
| `assistant:use` | yes | Open the admin assistant |
| `assistant:tools:read` | yes | Assistant tools that only read (Plex, Tautulli, Sonarr, Radarr, Overseerr lookups) |
| `assistant:tools:write` | no | Assistant tools that change data (media marking) |
| `assistant:tools:admin` | no | Assistant tools over admin-only data and connections: app data (invites, members, failed jobs), the knowledge base and MCP servers |
| `users:read` | yes | The users list, read-only |
| `affiliates:read` | yes | The Affiliates page's Applications, Affiliates and Invite tree tabs, read-only: no invite codes or labels, no History tab (with its block list) and no affiliate settings |
| `audit:read` | yes | The Audit log (`/admin/audit`) and its event pages: who did what, to whom and when, with a one-line summary. Not an event's stored details, and not a member's Audit tab |

A Support user sees Users and the Assistant page in the admin area, can open Affiliates (`/admin/affiliates`) and the
Audit log (`/admin/audit`), and the member app shows them the same Admin link an admin gets (`canEnterAdminArea`). Settings,
connections, LLM providers, Stripe, invites, queues, usage and cost, inactive members, a
member's detail page (with its Audit tab), role management and every affiliate decision (approve,
refuse, revoke, overrides, unblock) are refused on the server (a page
checks `assertAdmin()` or `assertPermission()`, and an action is built with
`adminAction` or `permissionAction`), not only hidden from the navigation.

### The audit log for a Support user

- Support reads **Admin > Audit log**: each event's time, words, category, who
  did it, whom it was about and a one-line summary. The summary is built only
  from known keys and fixed words (`lib/audit/summary.ts`), never from free
  text in the event's details.
- An event's stored details stay with admins. The loader leaves them out of
  every list row, and an event page read by Support carries none: the page
  says "Only admins can see the stored details." (`lib/data/audit-log.ts`).
- Names open the log scoped to that person, never the member's page, which
  Support is refused.
- Opening the log is audited too: one `AUDIT_LOG_VIEWED` row per viewer per
  hour, with the filters' ids, never names.

### The assistant for a Support user

- The assistant is a page, `/admin/assistant`, with the user's own conversation
  history. They can reopen and delete their own conversations and no one
  else's; admins still review every conversation on the LLM usage pages
  (`docs/privacy.md`, "Assistant page history"). Demoting an admin ends their
  conversations there, so a Support user never reads answers an admin was given.
- The tools sent to the model are those whose declared permission the user
  holds. `executeToolCall` checks again on every call and fails closed, so a
  prompt-injected tool name is refused before any service is called.
- Output has credential-like fields and personal contact details (email,
  addresses, per-user tokens) removed, and URLs with a `token=` or `apikey=`
  value are redacted (`lib/chatbot/executors/role-scrub.ts`). A tool error
  returns a fixed line, never the upstream text. Other members' viewing
  history stays visible, minus those fields, because troubleshooting needs it.
- Redaction is by key substring, so a future field such as `tokenCount` or `cookieConsent` is dropped too; name tool output fields with that in mind.
- Every tool call and every refusal is audited (`ASSISTANT_TOOL_CALLED`,
  `ASSISTANT_TOOL_DENIED`). The system prompt says what the caller cannot do.
- A Support user may send 30 messages an hour (admins 60) and counts against
  the per-member daily LLM cap (`llmDailyCapPerUserUsd`), not the admin cap.
- Discord is unchanged: the admin tier there is still `User.isAdmin`.

## Assigning the role

An admin opens the users list (or a member's page) and chooses **Give Support
role...**. Removing the role ends the user's sessions at once; assigning it
takes effect within five minutes, or at the next sign-in, and so does a change to `isAdmin`. Making a user an admin clears their role. Both are audited as
`USER_ROLE_CHANGED`. Only an admin can do this, so a Support user cannot grant
roles to anyone, themselves included. An admin cannot be given a role.

## Adding a tool or a page

- A new assistant tool must set `permission` (`assistant:tools:read` or
  `assistant:tools:write`); the type requires it. Anything that deletes,
  restarts or changes configuration is `write`.
- A new admin page must call `assertAdmin()` or `assertPermission()`
  (`__tests__/security/admin-page-guards.test.ts` fails otherwise).
- A new `'use server'` action is built with one of the action helpers; its
  auth level is recorded and checked by `__tests__/security/use-server-exports.test.ts`.
