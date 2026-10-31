# MCP endpoint

Plex Manager is an [MCP](https://modelcontextprotocol.io) server at
`/api/mcp`. An MCP client such as Claude Code connects with an admin's
personal API token and can then do anything that admin can do in the app:
make an invite and send its link, look up a member, change a setting, retry a
job. Every call goes through the same checks as the admin UI.

## Connect Claude Code

1. In **Admin, Settings, API access**, name a token (for example "Claude Code
   on my laptop"), choose when it expires and select **Make token**.
2. Copy the token, or the ready-made command shown with it. The token is shown
   once; the app keeps only its SHA-256.
3. Run the command:

   ```bash
   claude mcp add --transport http plex-manager https://plex.example.com/api/mcp --header "Authorization: Bearer pmk_..."
   ```

4. Ask Claude, for example "make a Plex invite for two people that lasts a
   week". The result carries the invite's `url`, the link to send.

Any client that speaks Streamable HTTP and can send an `Authorization: Bearer`
header works the same way.

## Tokens

- A token is `pmk_` and 43 characters. Keep it secret: it acts as you.
- It works only while you are an admin and your account is enabled. Demoting
  or disabling you stops every token of yours at once, with no wait.
- It expires after 30 days, 90 days (the default), a year, or never.
- **Revoke** in the same section stops it at once. Each admin sees and revokes
  only their own tokens, and holds at most ten live ones.
- Making and revoking a token are audited (`API_TOKEN_CREATED`,
  `API_TOKEN_REVOKED`), with the token's row id as `credentialId`, never the
  token.

## Tools

`tools/list` returns every tool the token's owner may use, about 185 for an admin:

| Source | What | Module |
|---|---|---|
| Server Actions | every admin and member action, named in snake case (`createInvite` is `create_invite`), with its Zod input as JSON Schema and its JSDoc summary as the description | `lib/mcp/action-tools.ts` |
| Admin reads | the lists and details the admin pages show (`list_users`, `list_invites`, `get_user`, `get_admin_settings`, ...), so a client can find the ids that actions take | `lib/mcp/read-tools.ts` |
| Assistant tools | the admin assistant's Plex, Tautulli, Sonarr, Radarr, Overseerr, media marking, app data and knowledge base tools | `lib/mcp/assistant-tools.ts` |

A tool call runs the action itself, inside the token owner's session
(`lib/mcp/principal.ts`): its auth check, input validation, rate limit and
audit entry all apply. Results are the action's own JSON,
`{ "success": true, "data": ... }` or
`{ "success": false, "code": "...", "error": "..." }`, with `isError` set on a
refusal. Secrets in settings show only their last four, as on the settings page.

Left out, with the reasons in `lib/mcp/action-modules.ts` and
`lib/mcp/action-tools.ts`: public actions and forms, actions that need a
browser (cookies, the setup claim and the setup Plex PIN), ones that only
record what a browser showed, the assistant's own chat turn, and making or
revoking tokens, so a token cannot mint another.

Every call writes `MCP_TOOL_CALLED` with the tool, its source, the token's row
id and whether it succeeded, never its arguments or output.

## Limits and transport

- 120 requests a minute per token (`mcp`), on top of each action's own limit.
- One JSON-RPC message per POST, answered with JSON. The server keeps no
  session, so GET and DELETE are 405 and there is no `Mcp-Session-Id`.
- Requests from a browser must come from the app's own origin (the transport's
  DNS rebinding rule); MCP clients send no `Origin`.
- A reverse proxy needs nothing special: `/api/mcp` is an ordinary POST route.

## Adding a tool

A new action in an existing module becomes a tool on its own. A new file
under `actions/` must be added to `ACTION_MODULES` or `EXCLUDED_MODULES` in
`lib/mcp/action-modules.ts`; `lib/mcp/__tests__/catalog.test.ts` fails until it
is. After changing an action's JSDoc summary, run `npm run mcp:docs`; a unit
test fails while `lib/mcp/action-docs.generated.ts` is stale.

An action must use `expireTag()` and `refreshView()` from
`@/lib/actions/invalidate` rather than `updateTag()` and `refresh()`, which
throw outside a Server Action; ESLint enforces it in `actions/`.
