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
| `users:read` | yes | The users list, read-only |

A Support user sees Users and the assistant in the admin area. Settings,
connections, LLM providers, Stripe, invites, queues, usage and cost, a
member's detail page and role management are refused on the server (a page
checks `assertAdmin()` or `assertPermission()`, and an action is built with
`adminAction` or `permissionAction`), not only hidden from the navigation.

### The assistant for a Support user

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
