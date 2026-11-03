# Assistant Secrets (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin keep a credential in Settings and let the admin assistant pass it to one allowed argument of one MCP tool as `{{secret:NAME}}`, so the value never reaches the model, the LLM provider, the stored conversation, the logs or the audit log.

**Architecture:** Two tables: `AssistantSecret` (encrypted `value`) and `AssistantSecretGrant` (secret, MCP server, remote tool, top-level argument). `executeMcpTool` hands the model's arguments to `lib/chatbot/secrets/resolve.ts`, which finds every placeholder, reads the server row with its grants and values in one snapshot, refuses anything not granted and fills a copy. `mcpCallTool` gets that copy, the URL and auth from the same read, a redactor that runs before its 20,000-character cut, and a flag that refuses cross-origin redirects. The admin prompt gains a SECRETS section built from the turn's loaded MCP routes. Settings gets a Secrets block whose actions and loader stay off `/api/mcp`, and saving an MCP server with a new address or auth drops its grants in the same transaction.

**Tech Stack:** Next.js 16 server actions (`adminAction`), Prisma 7 on PostgreSQL (interactive and batch transactions), Zod 4, Node `Buffer` encodings, Jest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-assistant-skills-design.md` (Phase 2 only: its Intent and "Phase 2: placeholder secrets").

## Global Constraints

- Secret `name`: `^[A-Z][A-Z0-9_]{0,63}$` (`SECRET_NAME_PATTERN`). `value`: at least 8 characters after `trim()`, refused below that on create and on update; a blank value on update keeps the stored one. `description`: trimmed, at most 300 characters, shown to the model.
- A grant is one `(serverId, tool, argument)`. `tool` is the remote tool name (`route.tool`), never `mcp_<server>_<tool>`. `argument` is a top-level argument matching `^[A-Za-z0-9_.-]{1,64}$` (`ARGUMENT_NAME_PATTERN`, the "name pattern" the spec's audit rule applies to `argument`). A grant allows the secret anywhere inside that argument, nested fields included.
- A secret save keeps the grants its form loaded by id (`keep`) and creates only new ticks (`add`). It never re-creates a grant from its fields, so a grant that a server repoint removed stays removed, even when the save comes from a Sheet opened before the repoint.
- Placeholder: `/\{\{secret:([^{}]*)\}\}/g`, the literal lowercase `{{secret:`, any run of characters other than braces, then `}}`. The captured text is the name as written, never trimmed or case-folded. Every match is a placeholder; one whose name fails `SECRET_NAME_PATTERN` (`{{secret: X}}`, `{{secret:x}}`, `{{secret:}}`) is refused like an unknown name. `{{ secret:X }}`, `{{SECRET:X}}` and `{secret:X}` are plain text. Only string values are searched; a placeholder in an object key refuses the call. Use `matchAll` and `replace` with a replacer function: never `test` or `exec` on the shared global regex (its `lastIndex` carries over), never a replacement string (a value holding `$&` must go in literally).
- `SECRETS_HEADER`, 287 characters with the spec's line breaks kept, ending in `\n`:
  ```
  === SECRETS ===

  To use a credential, put {{secret:NAME}} in an allowed tool argument, on its own
  or inside a longer value such as "Bearer {{secret:NAME}}". The real value
  is filled in after you send the call and is never shown to you. Never ask for a
  value, guess one or write one out.
  ```
  Then one line per secret with a loaded grant, in name order: `- NAME: <promptDescription(description)> (allowed in: mcp_x_y.apiKey, ...)`, targets in code-point order; an empty description gives `- NAME: (allowed in: ...)`. The section exists only in the admin web chat, only when a grant's tool is loaded this turn, between SKILLS and the access section. A value never enters the prompt.
- Denial: `Error: secret NAME is not available in that argument.`, the same text for an unknown, disallowed, undecryptable, misspelt or key placeholder; NAME is the name as written, cut to 64 characters. No call is made.
- Audit: `ASSISTANT_SECRET_USED` and `ASSISTANT_SECRET_DENIED`, each with `{ secretName, serverId, tool, argument }`, category `assistant`, labels "Assistant secret used" and "Assistant secret refused". `secretName` and `argument` are kept only when they match their pattern, else `"invalid"` (`INVALID_MARKER`), which the stored row and the log line keep as written. A refused call logs one `ASSISTANT_SECRET_DENIED`, for the first malformed or key placeholder, else the first one without a usable grant, and never `ASSISTANT_MCP_CALL`. A sent call logs one `ASSISTANT_SECRET_USED` per distinct secret and argument. The used summary names the secret and argument (an admin chose both); the refused summary is fixed words, because the model wrote both and Support reads summaries. Settings changes log `ASSISTANT_SOURCE_CHANGED` with `{ kind: "secret", action: "saved" | "deleted", id }`; an MCP server save or delete that removes grants adds `grantsRemoved: <count>`, only when the count is above 0.
- `ASSISTANT_SECRET_USED` and `lastUsedAt` are written once the value is sent: after `mcpCallTool` returns, whatever its result, if it posted `tools/call` (its `onSend` ran). A refused call, or one that failed before `tools/call` (an `initialize` that was refused or unreachable), writes neither. `lastUsedAt` is written at most once a minute per secret: `prisma.assistantSecret.updateMany({ where: { id, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: oneMinuteAgo } }] }, data: { lastUsedAt: now } })`.
- Redaction forms, for each substituted value (replaced with `{{secret:NAME}}`) and each composed string (a string argument that held a placeholder and anything else, replaced with the model's original string): raw; JSON-escaped (`JSON.stringify(s).slice(1, -1)`, whose replacement is JSON-escaped too, so a JSON result stays valid); `encodeURIComponent`; standard and URL-safe base64 of the UTF-8 bytes, both without `=` padding, so padded and unpadded echoes match, and after each its first ⌊4n/3⌋ characters as a form of its own (n the UTF-8 byte length; dropped when equal to the full form), which do not depend on the bytes after the value, so `base64(value + ":")` is covered too; lowercase and uppercase hex of the UTF-8 bytes. Longest form first, with literal `split`/`join`. The forms run on the text as received; then, if the result still parses as JSON, they run again on `JSON.stringify(JSON.parse(result))`, which is what `withLocalInstants` and `wrapToolOutput` would write anyway, so a server's own escapes (`\u0026`, `\/`) are decoded before the last pass, never after it. The first pass takes the text as received because a JSON round trip rounds integers past 2^53: an all-digit value echoed as a JSON number would otherwise reach the model nearly whole (`12345678901234567890` re-serialises as `12345678901234567000`). It runs inside `mcpCallTool` on the joined text before the 20,000-character cut, and on the failure line.
- `crossOriginBody: "refuse"` on `fetchWithSafeRedirects` throws `RedirectBlockedError` before any request to another origin, for every redirect status; same-origin hops are followed as today. `mcpCallTool` sets it on every request of a session whose arguments carry a substituted secret, and the call fails as `UNREACHABLE`.
- `EXCLUDED_MODULES` gains `"admin/assistant-secrets": "carries credential values"`; skill and knowledge sources stay in `ACTION_MODULES`.
- Migration folder `20270123100000_add_assistant_secrets`; changelog fragment `changelog.d/assistant-secrets.md`.
- Every interactive element gets a `data-testid` prefixed `settings-secret-`.
- Every new `.ts` file under `lib/chatbot/` or `lib/data/` starts with `import "server-only"` (`__tests__/security/server-only-modules.test.ts`). `lib/validations/assistant-secret.ts` does not and imports nothing: the logger, which client code loads too, imports it.
- `knip --production`: export a name only if a production module imports it; tag test-only exports `/** @internal */`. Drop the `@internal` tag from `mcpToolName` and `promptDescription`, which production code now imports.

### Settled from the code

1. Audit and log redaction: `persist` (`lib/security/audit-log.ts:284`) and the logger (`lib/utils/logger.ts:66`) run `sanitizeValue`. A `secretName` key contains `secret` (`fieldSubstrings`, `lib/utils/log-redaction.ts:51`), and a name of 33 characters or more matches `RANDOM_LOOKING` (`:68`), so either would store `[REDACTED]`. The marker `"invalid"` fails `SECRET_NAME_PATTERN`, so a pattern-only exception would still store `[REDACTED]` for it. Task 2 adds `REDACT_RULES.verbatimFields`, which also passes `INVALID_MARKER`.
2. Migrations: `checkMigrations` (`scripts/migrations/check.mjs:62-90`) wants a stamp later than every earlier folder's and at most `FUTURE_GRACE_DAYS = 180` days past the clock. `20270123100000` sorts after `20270122100000_add_skill_sources` and passes from 2026-07-27 on.
3. No key: `isEncryptionConfigured()` (`lib/security/crypto.ts:152`) is false exactly when no primary key exists; `ALLOW_PLAINTEXT_SECRETS` only lets such a process boot (`lib/env.ts:343`). Playwright sets `ENCRYPTION_KEYS` (`playwright.config.ts:18`).
4. Tool lists: only the MCP server holds tool names and input schemas (`mcpListTools`, `lib/chatbot/mcp/client.ts:202`); `McpServer.enabledTools` holds names. `loadMcpTools()` returns `routes` (model-facing name to `{ serverId, tool, ... }`), which `getToolsForContext` (`lib/chatbot/assistant.ts:65`) drops today, and `discoverMcpTools` (`actions/admin/assistant-sources.ts:122`) drops the schema.
5. MCP save path: `saveMcpServer` (`actions/admin/assistant-sources.ts:65`) normalises `url`, resolves `authHeaderSecret` with `resolveSecretForOrigin`, and writes at `:101`; `deleteMcpServer` is at `:109`. The stored `authHeaderSecret` reads back decrypted, so values compare as plain strings.
6. Redirects: `fetchWithSafeRedirects(url, init)` (`lib/connections/http.ts:128`) follows up to three hops by hand, drops only `x-api-key`, `x-goog-api-key`, `x-plex-token`, `x-emby-token` and `authorization` on a cross-origin hop, and keeps method and body on 307 and 308. `Session.post` (`client.ts:140`) and `Session.close` (`:169`) call it. `mcpCallTool` cuts the text to 20,000 characters (`:230`) before returning, so redaction must run inside it. `withSession` (`:187-199`) opens the session before it runs the call, so a refused or unreachable `initialize` returns before `tools/call` carries the value; `mcpCallTool` therefore reports the send itself (`onSend`). The client logs on its own (`:194`), which is why Task 6's conversation test runs the real client.
7. Judge and usage: the turn's tool log stores `toolCall.function.arguments` (the model's text) and `executeToolCall`'s output (`lib/chatbot/conversation.ts:163-169`), which for an MCP tool is `withLocalInstants(executeMcpTool(…))` (`lib/chatbot/executors/index.ts:221-224`), a JSON parse and re-stringify. The model and `usagePrompt` get `wrapToolOutput`'s second parse and re-stringify of it (`conversation.ts:54-62`). Both decode a server's JSON escapes and round integers past 2^53, hence the two passes in the redaction rule. The judge reads only that log and `getAdminAssistantContext`. `LLMUsage` stores the `usagePrompt` (`conversation.ts:171`) and the model's own text or tool calls (`lib/llm/chat.ts:194-195`). Task 6's conversation test pins both.
8. UI: `components/ui/` has no multi-select; a list of `Checkbox` rows is the precedent (`components/admin/settings/mcp-server-form.tsx:125-141`). The `Checkbox` has no name of its own (`components/ui/checkbox.tsx:13-14`); the precedent names it with `aria-label`. `discoverMcpTools` (`actions/admin/assistant-sources.ts:122-129`) checks no `isActive` and sends the stored auth header, so the secret form never calls it for an off server.
9. E2E: there is no MCP mock or helper (`e2e/mocks` holds Jellyfin, LLM and Tautulli). Task 10 adds `e2e/mocks/mcp-server.ts` in the shape of `startMockTautulli`, started by the one spec that needs it, which seeds an `McpServer` row with `createE2EPrismaClient()`. Playwright runs one worker, so no other spec sees the active server.
10. Placeholders: the regex above. The spec's audit rule ("invalid" for a name off the pattern) needs the collector to see such names, so any `{{secret:…}}` counts.
11. A column outside `FREE_TEXT_FIELDS` is written with `encryptSecret` (`lib/db/encryption-extension.ts:93-94`), which keeps a value that already looks encrypted (`lib/security/crypto.ts:200-209`), and nothing binds a ciphertext to its column: a pasted `enc:v2:…` from a dump would read back, and be sent to an MCP host, as another column's plaintext. Task 1 registers `AssistantSecret.value` in `FREE_TEXT_FIELDS` as well, so every write is sealed (`encryptText`). That also keeps the plain name `value` out of key-name redaction (`ENCRYPTED_CREDENTIALS` leaves out free text, `lib/mcp/redact.ts:63-65`), which would otherwise redact every `value` field in `/api/mcp` results and judge tool logs. The "flags every column" test (`__tests__/utils/assert-no-secret-keys.test.ts:37`) hard-codes its personal-data models, so it leaves out `AssistantSecret` explicitly.
12. The generated client has no relation-join strategy (`previewFeatures: []`, no `relationLoadStrategy`), so a nested read can run as several statements; the one-read rule uses a REPEATABLE READ transaction.
13. No write in this codebase puts a nested `deleteMany` beside a nested `create`, so nothing here shows which one Prisma runs first, and a create that ran first would be deleted by a `notIn` filter. A batch `$transaction([...])` runs in array order, so the secret update, its grant delete and its grant create are a batch (Task 8), like Task 7's repoint.

## Review Focus

1. A JSON result that the app's own JSON round trip changes: a server whose encoder escapes characters (Go's `\u0026` for `&`, PHP's `\/` for `/`, Python's `\u00e9`) echoes a value that holds them, or echoes an all-digit value of 16 or more digits as a JSON number: the model, the tool log and `LLMUsage` get `{{secret:NAME}}`, never the value the round trip would decode nor the digits it would keep (Task 3 tests `redacts a value a JSON encoder escaped` and `redacts a long number echoed as JSON`, Task 6 test `stores only the placeholder when the server escapes the value in JSON`).
2. A generated password holding `$&`, `$1`, `$'` or `$$` is sent exactly as stored (Task 3 test `inserts a value with $ patterns literally`).
3. A placeholder typed slightly off (`{{secret: SONARR_KEY}}`, `{{secret:sonarr_key}}`, `{{secret:}}`) is refused with the usual message, never sent as literal text or matched to `SONARR_KEY`, and the stored audit row says `"invalid"`, not `[REDACTED]` (Task 6 test `refuses a misspelt placeholder and audits it as invalid`, Task 2 test `stores the invalid marker`).
4. A value pasted with a trailing newline or spaces is saved trimmed, and the 8-character minimum counts the trimmed value (Task 8 test `trims the value before checking its length`).
5. A Secret Sheet opened before an MCP server was repointed, then saved for a description change, does not bring back the grants the repoint removed (Task 8 test `does not restore a grant a server save removed`).

Accepted, not handled: a value filled into a JSON-encoded string argument goes in raw, so a value holding `"` or `\` breaks that JSON (the spec keeps such strings unparsed). A route found before its server or tool was turned off still sends, as every MCP call does today; the grant read guards the URL and auth only. Redaction misses forms off the list (wrapped or shifted base64, HTML entities, mixed-case hex, `+` for spaces), as the spec accepts, and a JSON fragment inside text that is not JSON (including JSON the first pass turned into text by replacing a number) keeps the server's own escapes. Only the call that carried a secret is redacted: another call, in parallel, later or to another tool, that returns the value is not, so an admin grants only tools whose server they trust not to hand the value back. A remote tool name of 33 or more letters, digits, `_` or `-` shows as `[REDACTED]` in these rows' `tool`, as it does in `ASSISTANT_MCP_CALL` today. Two admins saving one secret at once: the last save wins, grants included.

---

### Task 1: Tables, migration and the encrypted column

**Files:**
- Modify: `prisma/schema.prisma` (both models after `SkillSource`, ~line 1265; `secretGrants AssistantSecretGrant[]` on `McpServer`, ~line 1228)
- Create: `prisma/migrations/20270123100000_add_assistant_secrets/migration.sql`
- Modify: `lib/db/encrypted-fields.ts` (`AssistantSecret: ["value"]` in `ENCRYPTED_FIELDS` and in `FREE_TEXT_FIELDS`; the `FREE_TEXT_FIELDS` JSDoc adds that a credential an admin types is sealed too, so a pasted ciphertext is stored as text and never decrypted into another column's secret, and that its plain name stays out of key-name redaction)
- Modify: `__tests__/utils/assert-no-secret-keys.test.ts` ("flags every column" leaves out `AssistantSecret`, with a comment: `value` is too common a key to flag, and `lib/data/__tests__/assistant-secrets.test.ts` looks for the value text itself)
- Modify: `docs/privacy.md` (two rows after `SkillSource`, ~line 167), `__tests__/helpers/factories.ts` (`buildAssistantSecret`)
- Create: `changelog.d/assistant-secrets.md`
- Test: `lib/chatbot/mcp/__tests__/encrypted-fields.test.ts`, `lib/mcp/__tests__/redact.test.ts`, `__tests__/lib/prisma-encryption-extension.test.ts`, `__tests__/security/use-cache-no-secrets.test.ts`, new `lib/chatbot/secrets/__tests__/tables.pg.test.ts`

**Interfaces:**
- Produces: the spec's two models, copied exactly, and `McpServer.secretGrants`; delegates `prisma.assistantSecret` and `prisma.assistantSecretGrant`.
  ```ts
  export function buildAssistantSecret(overrides?: Partial<AssistantSecret>): AssistantSecret  // name "SONARR_KEY", description "", value "abcdefgh1234", lastUsedAt null
  ```

- [ ] **Step 1: Write the failing tests.**
  - `encrypted-fields.test.ts`: `ENCRYPTED_FIELDS.AssistantSecret` and `FREE_TEXT_FIELDS.AssistantSecret` both equal `["value"]`.
  - `redact.test.ts`: add `'value'` to the `is not` list, and `keeps an ordinary value field`: `redacted({ name: "x", value: "abc" })` equals its input.
  - `prisma-encryption-extension.test.ts`, under "free text", `seals a pasted ciphertext as a secret's value`, as "seals text that looks like a stored secret" does: `run("AssistantSecret", "create", { data: { name: "A", value: encryptSecret("plex-token") } })` stores a value matching `/^enc:v2:k1:/` that is not the pasted one, and a `findMany` of that row reads back the pasted text.
  - `use-cache-no-secrets.test.ts`, `covers AssistantSecret`: `ENCRYPTED_FIELDS.AssistantSecret` contains `value`; for the source `"use cache"\nawait prisma.assistantSecret.findMany({ where: {} })`, the reads pattern built from `delegate("AssistantSecret")` matches and `selects(source, "{ where: {} }")` is false, as "would catch a cached module that reads a secret" does.
  - `tables.pg.test.ts` (`describePg`, set up like `lib/chatbot/mcp/__tests__/encryption.pg.test.ts`, names prefixed with a run id):
    - `stores the value encrypted and reads it through a server's grants`: a server, a secret with value `plain-secret-value` and a grant. `$queryRaw` of `"value"` matches `/^enc:v2:k1:/`, and `prisma.$transaction((tx) => tx.mcpServer.findUnique({ where: { id }, select: { url: true, secretGrants: { select: { argument: true, secret: { select: { name: true, value: true } } } } } }), { isolationLevel: "RepeatableRead" })` gives the plain value.
    - `deleting a server or a secret removes its grants`: after deleting the server, `assistantSecretGrant.count({ where: { serverId } })` is 0; a grant on a second server is gone after deleting its secret.
    - `refuses a second identical grant`: creating the same `(secretId, serverId, tool, argument)` twice rejects.
- [ ] **Step 2:** Run `npx jest lib/chatbot/mcp/__tests__/encrypted-fields.test.ts lib/mcp/__tests__/redact.test.ts __tests__/lib/prisma-encryption-extension.test.ts __tests__/security/use-cache-no-secrets.test.ts`. Expected: the `AssistantSecret` pins and the sealing test FAIL; the `value` tests pass now and guard Step 3 (registering the column outside `FREE_TEXT_FIELDS` would fail them).
- [ ] **Step 3:** Add the models and the back-relation, register `AssistantSecret: ["value"]` in both maps, leave `AssistantSecret` out of "flags every column", add `buildAssistantSecret` beside `buildSkillSource`, and add the privacy rows:
  `| \`AssistantSecret\` | name, a description shown to the assistant, a credential value and when it was last used | \`value\` |`
  `| \`AssistantSecretGrant\` | which MCP server, tool and argument may receive each secret | No |`
- [ ] **Step 4:** Generate the migration against a fresh throwaway database whose name ends in `_test`: `npx prisma migrate dev --create-only --name add_assistant_secrets`. Rename the folder to `20270123100000_add_assistant_secrets` and review the SQL: two `CREATE TABLE`, a unique index on `AssistantSecret.name`, a unique index on the four grant columns, an index on `serverId`, and both foreign keys `ON DELETE CASCADE`. Then run `npm run db:deploy`.
- [ ] **Step 5:** Write `changelog.d/assistant-secrets.md`:
  ```markdown
  ### Added

  - **Assistant secrets:** keep a credential in Settings, Assistant sources, Secrets, and allow it in one argument of one MCP tool. The assistant and skills write `{{secret:NAME}}`; the app fills in the value after the model sends the call, so the model, the LLM provider, the stored conversation and the audit log only see the placeholder. Saving a secret needs an encryption key (`ENCRYPTION_KEYS`). See `docs/assistant.md`.

  ### Changed

  - **Database for assistant secrets:** the database gets the `AssistantSecret` and `AssistantSecretGrant` tables. The next boot runs one automatic pass that re-encrypts the stored secrets, because a new secret column is added.
  - **MCP servers:** saving a server with a new URL, auth header name or header value removes its secret grants, so a repointed server receives no secret until an admin grants it again.
  ```
- [ ] **Step 6:** Verify: `npm run db:generate && node scripts/check-migrations.mjs && npm run typecheck`, then `npx jest lib/chatbot/mcp lib/mcp/__tests__/redact.test.ts __tests__/lib/prisma-encryption-extension.test.ts __tests__/security/use-cache-no-secrets.test.ts __tests__/utils/assert-no-secret-keys.test.ts __tests__/docs/privacy-inventory.test.ts lib/security/__tests__/reencrypt.test.ts`, then `TEST_DATABASE_URL=<the _test url> JEST_INTEGRATION=1 npx jest --runInBand lib/chatbot/secrets/__tests__/tables.pg.test.ts`. Expected: PASS.
- [ ] **Step 7:** Commit:
  ```bash
  git add prisma/schema.prisma prisma/migrations/20270123100000_add_assistant_secrets lib/db/encrypted-fields.ts \
    __tests__/utils/assert-no-secret-keys.test.ts docs/privacy.md __tests__/helpers/factories.ts changelog.d/assistant-secrets.md \
    lib/chatbot/mcp/__tests__/encrypted-fields.test.ts lib/mcp/__tests__/redact.test.ts __tests__/lib/prisma-encryption-extension.test.ts \
    __tests__/security/use-cache-no-secrets.test.ts lib/chatbot/secrets/__tests__/tables.pg.test.ts
  git commit -m "Add the assistant secret tables"
  ```

### Task 2: Audit events with readable secret names

**Files:**
- Create: `lib/validations/assistant-secret.ts`
- Modify: `lib/utils/log-redaction.ts` (`REDACT_RULES.verbatimFields`, checked first in `sanitizeField`; the module's rule list)
- Modify: `lib/security/audit-log.ts` (two members after `ASSISTANT_MCP_CALL` under one comment; the `ASSISTANT_SOURCE_CHANGED` comment adds the `secret` kind and `grantsRemoved`)
- Modify: `lib/audit/events.ts` (two labels), `lib/audit/summary.ts` (three summaries and their JSDoc table rows)
- Test: `lib/utils/__tests__/logger-redaction.test.ts`, `__tests__/lib/security/audit-log.test.ts`, `lib/audit/__tests__/summary.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/validations/assistant-secret.ts
  export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/
  export const ARGUMENT_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/
  /** What the audit stores for a model-written secret name or argument that fails its pattern. */
  export const INVALID_MARKER = "invalid"
  // lib/utils/log-redaction.ts, a new entry inside REDACT_RULES: a string under one of these keys (lowercased,
  // looked up with Object.hasOwn) that matches its pattern, or is INVALID_MARKER, is logged unchanged;
  // anything else takes today's rules
  verbatimFields: { secretname: SECRET_NAME_PATTERN, argument: ARGUMENT_NAME_PATTERN },
  // lib/security/audit-log.ts, two new members of AuditEventType
  ASSISTANT_SECRET_USED = "ASSISTANT_SECRET_USED",
  ASSISTANT_SECRET_DENIED = "ASSISTANT_SECRET_DENIED",
  ```
- Summaries never read `tool` or `serverId`:
  - `ASSISTANT_SECRET_USED` reads `secretName` only when it matches `SECRET_NAME_PATTERN`, and `argument` only when it matches `ARGUMENT_NAME_PATTERN` and is not `INVALID_MARKER`; both are an admin's choices there (an existing secret's name, a granted argument). "SONARR_KEY sent in apiKey", or "SONARR_KEY sent" without an argument; null without a name.
  - `ASSISTANT_SECRET_DENIED` reads no detail: the model wrote the name and the argument, which can hold any token that fits the patterns, and Support reads the line. Always "A secret placeholder was refused".
  - `ASSISTANT_SOURCE_CHANGED`: `SOURCE_KINDS` gains `secret: "Assistant secret"`. A positive whole `grantsRemoved` appends " (2 secret grants removed)" or " (1 secret grant removed)" through `counted(f, …)`.

- [ ] **Step 1: Write the failing tests.**
  - `logger-redaction.test.ts`:
    - `keeps a secret's name and argument readable`: `logger.info("x", { secretName: "A".repeat(64), argument: "a".repeat(40) })` prints that metadata unchanged.
    - `keeps the invalid marker`: `logger.info("x", { secretName: "invalid", argument: "invalid" })` prints both unchanged.
    - `still redacts what is not a name`: a `secretName` of `"sk-live-abc"` or `"a".repeat(40)`, and an `argument` of `"b".repeat(65)`, each print `[REDACTED]`.
    - `ignores inherited keys`: `logger.info("x", { constructor: "c", toString: "t" })` prints both unchanged.
  - `audit-log.test.ts`, in "persisted audit rows":
    - `keeps a secret's name and argument in the stored row`: after `logAuditEvent(AuditEventType.ASSISTANT_SECRET_DENIED, "admin-1", { secretName: "B".repeat(40), serverId: "srv-1", tool: "api", argument: "apiKey" })` and `flush()`, `auditLog.create` got exactly those four fields as `details`.
    - `stores the invalid marker`: the same with `{ secretName: "invalid", serverId: "srv-1", tool: "api", argument: "invalid" }` stores exactly those four fields.
  - `summary.test.ts`:
    - the used lines above, from `{ secretName, serverId: "srv-1", tool: "api", argument }`: `argument: "invalid"` gives "SONARR_KEY sent", and `secretName: "invalid"` gives null;
    - the denied line, "A secret placeholder was refused", for any details, including `{ secretName: "JBSWY3DPEHPK3PXP", serverId: "srv-1", tool: "api", argument: "ghp_" + "a".repeat(36) }`, whose line contains neither value;
    - `secret` rows in "has a line for a %s source %s": "Assistant secret saved", "Assistant secret removed", "Assistant secret refreshed";
    - `counts the grants a server change removed`: `{ kind: "mcp", action: "saved", id: "m1", grantsRemoved: 2 }` gives "MCP server saved (2 secret grants removed)", `1` gives "(1 secret grant removed)", and `0`, `-1`, `1.5` and `"2"` add nothing;
    - the "never echoes" table gains both new events with NAME, EMAIL and NOTE in `secretName`, `argument`, `tool` and `serverId`.
- [ ] **Step 2:** Run `npx jest lib/utils/__tests__/logger-redaction.test.ts __tests__/lib/security/audit-log.test.ts lib/audit`. Expected: FAIL (names and the marker print `[REDACTED]`, no summaries), except the cases that expect what today's code already gives, which pin it and already pass: `still redacts what is not a name`, `ignores inherited keys` (it guards the `Object.hasOwn` lookup), a null used line, counts that add nothing and the new never-echoes rows.
- [ ] **Step 3:** Implement. The enum comment: the assistant passed an assistant secret to an MCP tool, or refused a call whose placeholder was not granted; details carry the secret's name, the server id, the remote tool name and the top-level argument, with name and argument `INVALID_MARKER` when off their pattern, never the value. Labels: `ASSISTANT_SECRET_USED: { label: "Assistant secret used", category: "assistant" }` and `ASSISTANT_SECRET_DENIED: { label: "Assistant secret refused", category: "assistant" }`. The summary JSDoc table gains `ASSISTANT_SECRET_USED` (`secretName`, `argument`: "SONARR_KEY sent in apiKey") and `ASSISTANT_SECRET_DENIED` (none: "A secret placeholder was refused").
- [ ] **Step 4:** Run `npx jest lib/utils lib/audit __tests__/lib/security && npm run typecheck`. Expected: PASS (`events.test.ts` checks the new labels unchanged).
- [ ] **Step 5:** Commit:
  ```bash
  git add lib/validations/assistant-secret.ts lib/utils/log-redaction.ts lib/security/audit-log.ts lib/audit/events.ts lib/audit/summary.ts \
    lib/utils/__tests__/logger-redaction.test.ts __tests__/lib/security/audit-log.test.ts lib/audit/__tests__/summary.test.ts
  git commit -m "Audit assistant secret use with readable names"
  ```

### Task 3: Find, fill and redact placeholders

**Files** (each `import "server-only"`):
- Create: `lib/chatbot/secrets/placeholders.ts`, `lib/chatbot/secrets/redact.ts`
- Test: `lib/chatbot/secrets/__tests__/placeholders.test.ts`, `redact.test.ts` (both `@jest-environment node`)

**Interfaces:**
```ts
// placeholders.ts
export interface Placeholder { name: string; argument: string; inKey: boolean }  // name as written; argument: the top-level key it sits under
/** Depth-first in key order: for each key, its own placeholders, then its value's. */
export function findPlaceholders(args: Record<string, unknown>): Placeholder[]
/** A deep copy with every placeholder filled; called only once every name has a value. */
export function fillPlaceholders(args: Record<string, unknown>, values: ReadonlyMap<string, string>): {
  args: Record<string, unknown>
  composed: { original: string; filled: string }[]  // each string that held a placeholder and is not exactly one placeholder
}
// redact.ts
/** @internal */ export function secretForms(text: string): string[]  // the forms, in Global Constraints order, duplicates dropped
/** The returned function runs the forms on the output as received, then, when the result parses as JSON, again on JSON.stringify(JSON.parse(result)). */
export function secretRedactor(secrets: { text: string; placeholder: string }[]): (output: string) => string
```

- [ ] **Step 1: Write the failing `placeholders.test.ts`:**
  - `finds placeholders under their top-level argument`: `{ apiKey: "{{secret:A}}", auth: "Bearer {{secret:B}}", body: { headers: [{ x: "{{secret:C}}" }] }, raw: "{\"k\":\"{{secret:D}}\"}", n: 5, on: true, none: null }` gives A in `apiKey`, B in `auth`, C in `body` and D in `raw`, all `inKey: false`, in that order.
  - `finds a placeholder in a key`: `{ "{{secret:A}}": "x" }` gives `{ name: "A", argument: "{{secret:A}}", inKey: true }`; `{ body: { "{{secret:A}}": 1 } }` gives argument `body`, `inKey: true`.
  - `counts every {{secret:…}}`: `"{{secret: X }}"`, `"{{secret:x}}"` and `"{{secret:}}"` give the names `" X "`, `"x"` and `""`; `"{{secret:A}}{{secret:B}}"` gives two. `"{{ secret:X }}"`, `"{{SECRET:X}}"`, `"{secret:X}"` and `"{{secret:X}"` give none.
  - `finds the same placeholders on every call`: two calls on one object return equal lists.
  - `fills values in place, in a copy`: `fillPlaceholders({ apiKey: "{{secret:A}}", auth: "Bearer {{secret:A}}", two: "{{secret:A}}{{secret:A}}", n: 1, list: ["{{secret:A}}"] }, new Map([["A", "p@ss-1234"]]))` fills every string, keeps `n`, returns `composed` for `auth` and `two` only, and leaves its input equal to a `structuredClone` taken before.
  - `inserts a value with $ patterns literally`: the value `p$&q$1$'r$$s` turns `"Bearer {{secret:A}}"` into `"Bearer p$&q$1$'r$$s"`.
- [ ] **Step 2: Write the failing `redact.test.ts`**, with `b64 = (s: string) => Buffer.from(s).toString("base64")`:
  - `lists each form once`: `secretForms("abcdefgh")` equals `["abcdefgh", "YWJjZGVmZ2g", "YWJjZGVmZ2", "6162636465666768"]`.
  - `redacts every form of a value`: for `p"/+?=Key-9`, a text joining all of `secretForms(value)` with ` | ` comes back with no form left and `{{secret:A}}` in each place.
  - `redacts in an error line`: `"Error: upstream said Bearer " + value` becomes `"Error: upstream said Bearer {{secret:A}}"`.
  - `keeps JSON valid`: for the value `a"b\\c12345`, `JSON.parse` of the redacted `JSON.stringify({ echo: value })` equals `{ echo: "{{secret:A}}" }`; for a composed original `say "hi" {{secret:A}}`, the redacted `JSON.stringify({ echo: filled })` parses back to the original.
  - `redacts a composed string's base64`: first assert that `b64("user:abc12345")` does not contain `b64("abc12345").replace(/=+$/, "")`; then, with `{ text: "abc12345", placeholder: "{{secret:A}}" }` and `{ text: "user:abc12345", placeholder: "user:{{secret:A}}" }`, `"auth " + b64("user:abc12345")` becomes `"auth user:{{secret:A}}=="` (the padding stays, as below).
  - `matches base64 with and without padding`: for `abc12345`, both `YWJjMTIzNDU=` and `YWJjMTIzNDU` lose `YWJjMTIzNDU`.
  - `redacts base64 followed by more bytes`: with secret `abc12345` (A), `b64("abc12345x")` becomes `"{{secret:A}}V4"`; with secret `abcdefghij` (A), `b64("abcdefghij:")` becomes `"{{secret:A}}jo="`.
  - `redacts a value a JSON encoder escaped`: for the value `ab/cd&e12` (A), the output `'{"echo":"ab\\/cd\\u0026e12"}'` comes back as text that parses to `{ echo: "{{secret:A}}" }`.
  - `redacts a long number echoed as JSON`: with secret `12345678901234567890` (A), `'{"echo":12345678901234567890}'` becomes `'{"echo":{{secret:A}}}'` (no longer JSON, so no second pass; a round trip first would leave `12345678901234567000`).
  - `replaces longer values first`: secrets `abc12345` (A) and `xxabc12345yy` (B) turn `"xxabc12345yy and abc12345"` into `"{{secret:B}} and {{secret:A}}"`.
  - `leaves other text alone`: `secretRedactor([{ text: "abc12345", placeholder: "{{secret:A}}" }])("abc1234 and abc12345x")` gives `"abc1234 and {{secret:A}}x"`.
- [ ] **Step 3:** Run `npx jest lib/chatbot/secrets`. Expected: FAIL (modules not found).
- [ ] **Step 4:** Implement both modules with the regex and forms in Global Constraints.
- [ ] **Step 5:** Run `npx jest lib/chatbot/secrets __tests__/security/server-only-modules.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 6:** Commit:
  ```bash
  git add lib/chatbot/secrets/placeholders.ts lib/chatbot/secrets/redact.ts \
    lib/chatbot/secrets/__tests__/placeholders.test.ts lib/chatbot/secrets/__tests__/redact.test.ts
  git commit -m "Find, fill and redact secret placeholders"
  ```

### Task 4: Refuse cross-origin redirects, redact before the cut and report the send

**Files:**
- Modify: `lib/connections/http.ts` (`fetchWithSafeRedirects` third parameter; a module JSDoc bullet)
- Modify: `lib/chatbot/mcp/client.ts` (`Session` and `withSession` carry the redirect option to both `fetchWithSafeRedirects` calls; `mcpCallTool` options; module JSDoc)
- Test: `lib/connections/__tests__/http.test.ts`, `lib/chatbot/mcp/__tests__/client.test.ts`

**Interfaces:**
```ts
export async function fetchWithSafeRedirects(url: string, init: RequestInit = {}, options: { crossOriginBody?: "refuse" } = {}): Promise<Response>
export async function mcpCallTool(
  endpoint: McpEndpoint, name: string, args: Record<string, unknown>,
  options: { crossOriginBody?: "refuse"; redact?: (text: string) => string; onSend?: () => void } = {}
): Promise<McpResult<string>>  // redact runs on the joined text, before the 20,000-character cut;
                               // onSend runs once, just before the tools/call request is posted
```
`mcpListTools` keeps its signature; its session passes `{}`.

- [ ] **Step 1: Write the failing tests.**
  - `http.test.ts`: `other` records each request's method and body in `otherRequests` (emptied in `beforeEach`) before it echoes. `main` gains `/to-other-307` (a 307 to `${other.origin}/echo`), `/same-307` (a 307 to `/echo-body`) and `/echo-body` (answers `{ method, body }`). Each test POSTs `'{"apiKey":"v4lue-123"}'` with `Content-Type: application/json` through `fetchWithSafeRedirects`:
    - `refuses a cross-origin redirect when asked, before the body leaves`: `/to-other-307` with `{ crossOriginBody: "refuse" }` rejects with `name: "RedirectBlockedError"`, and `otherRequests` stays empty.
    - `re-sends the body on a cross-origin 307 by default`: the same call without the option resolves 200, and `otherRequests[0]` is `{ method: "POST", body: '{"apiKey":"v4lue-123"}' }` (today's behaviour, pinned).
    - `follows a same-origin 307 with the option`: `/same-307` answers `{ method: "POST", body: '{"apiKey":"v4lue-123"}' }`.
  - `client.test.ts`:
    - `refuses cross-origin redirects for the whole session when asked`: after `mcpCallTool(ENDPOINT, "search", { q: "x" }, { crossOriginBody: "refuse" })`, the third argument of all four `fetchMock` calls (initialize, initialized, the call, the DELETE) is `{ crossOriginBody: "refuse" }`; after a call without options, each is `{}`.
    - `redacts before the cut`: a reply of `"x".repeat(19_995) + "s3cr3t-value"` with `redact: (text) => text.split("s3cr3t-value").join("{{secret:A}}")` gives `data` of length 20,000 that does not contain `"s3cr3"`.
    - `reports the send just before tools/call`: an `onSend` spy runs once, and when it runs `fetchMock` has two calls (initialize, initialized); with a 401 reply to `initialize`, it never runs.
- [ ] **Step 2:** Run `npx jest lib/connections/__tests__/http.test.ts lib/chatbot/mcp/__tests__/client.test.ts`. Expected: the refusal, option, cut and send tests FAIL; the two that pin today's redirects pass.
- [ ] **Step 3:** Implement. The refusal goes first inside the existing `next.origin !== current.origin` branch, before the auth headers are dropped, with the message "Cross-origin redirect refused". `onSend` runs inside the session's `run`, before `session.request("tools/call", …)`.
- [ ] **Step 4:** Run the same command, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit:
  ```bash
  git add lib/connections/http.ts lib/chatbot/mcp/client.ts lib/connections/__tests__/http.test.ts lib/chatbot/mcp/__tests__/client.test.ts
  git commit -m "Refuse cross-origin redirects for MCP calls that carry a secret"
  ```

### Task 5: SECRETS section in the admin prompt

**Files:**
- Create: `lib/chatbot/secrets/prompt.ts` (`import "server-only"`)
- Modify: `lib/chatbot/skills/prompt.ts` (drop `@internal` from `promptDescription`)
- Modify: `lib/chatbot/assistant.ts` (`getToolsForContext` returns routes; `wantsSkills` becomes `adminChat`, which now gates both sections; `getSystemPrompt` takes the secrets section; the JSDoc of `permissions`, `getSystemPrompt` and `getAdminAssistantContext` names it)
- Test: `lib/chatbot/secrets/__tests__/prompt.test.ts`, `lib/chatbot/__tests__/assistant.test.ts`

**Interfaces:**
- Consumes: `promptDescription` (Phase 1); `loadMcpTools().routes`.
- Produces:
  ```ts
  /** @internal */ export const SECRETS_HEADER: string  // the Global Constraints text
  type SecretPromptRow = { name: string; description: string; grants: { serverId: string; tool: string; argument: string }[] }
  /** findMany({ select: { name: true, description: true, grants: { select: { serverId: true, tool: true, argument: true } } }, orderBy: { name: "asc" } }), never `value`. */
  export function loadSecretsForPrompt(): Promise<SecretPromptRow[]>
  /** One line per secret with a grant on a loaded route (`loaded`: model-facing name to its server and remote tool); null when there is none. */
  export function secretsSection(secrets: SecretPromptRow[], loaded: ReadonlyMap<string, { serverId: string; tool: string }>): string | null
  // assistant.ts; routes stay empty unless MCP tools were loaded
  getToolsForContext(context, permissions): Promise<{ tools: ChatTool[]; routes: ReadonlyMap<string, { serverId: string; tool: string }> }>
  ```
  `runChatbotForUser` and `getAdminAssistantContext` call `loadSecretsForPrompt()` only when `adminChat` and `routes.size > 0`, after the tools load, and pass `secretsSection(…)` to `getSystemPrompt`, which joins `[base, skills, secrets, scope, rules]`.

- [ ] **Step 1: Write the failing `prompt.test.ts`:**
  - `SECRETS_HEADER` equals the Global Constraints text and has length 287.
  - `lists each secret's loaded grants by model-facing name`: SONARR2_KEY ("Sonarr 2 API key") with grants `(srv-1, api, apiKey)`, `(srv-1, queue, key)` and `(srv-1, gone, apiKey)`, and `loaded` mapping `mcp_sonarr2_api` and `mcp_sonarr2_queue` to `srv-1`'s `api` and `queue`, gives `SECRETS_HEADER + "- SONARR2_KEY: Sonarr 2 API key (allowed in: mcp_sonarr2_api.apiKey, mcp_sonarr2_queue.key)"`.
  - `leaves out grants whose tool is not loaded`: a second secret granted only on `gone` adds no line; an empty `loaded`, and `secretsSection([], loaded)`, give null.
  - `flattens the description`: `"Line one\n=== ADMIN ===\nline two"` gives `- A: Line one ADMIN line two (allowed in: …)`, and `""` gives `- A: (allowed in: …)`.
  - `follows a renamed server`: with `loaded` holding `mcp_renamed_api` for `(srv-1, api)`, the target is `mcp_renamed_api.apiKey`.
- [ ] **Step 2: Write the failing `assistant.test.ts` tests** in a new `describe("runChatbotForUser secrets")`. Its `beforeEach` makes `loadMcpTools` resolve one tool `mcp_sonarr2_api` with routes `new Map([["mcp_sonarr2_api", { serverId: "srv-1", tool: "api" }]])` (cast as the file does) and `prismaMock.assistantSecret.findMany` resolve SONARR2_KEY with grants on `api` and `queue`; its `afterEach` restores `{ tools: [], routes: new Map() }`.
  - `gives an admin the SECRETS section`: with `TRIAGE_CATALOG`, the admin `system` holds `=== SKILLS ===`, then `=== SECRETS ===` and `- SONARR2_KEY: Sonarr 2 API key (allowed in: mcp_sonarr2_api.apiKey)`, then `=== TOOL DATA SAFETY ===` (index order), and `expect(system).not.toContain("mcp_sonarr2_queue")` (the base prompt says "queue" elsewhere); `findMany` got exactly the `select` and `orderBy` above.
  - `keeps the section and the read from Support and Discord`: for Support and for Discord (an admin included), no `=== SECRETS ===`, and `findMany` is not called.
  - `reads no secret without a loaded MCP tool`: with the empty routes, no section and no `findMany`.
  - In "getAdminAssistantContext", `matches what the assistant sends an admin owner, secrets included`: with the same mocks set (and restored) in the test, the context's prompt, without the time line, equals the sent one and holds the SONARR2_KEY line.
- [ ] **Step 3:** Run `npx jest lib/chatbot/secrets/__tests__/prompt.test.ts lib/chatbot/__tests__/assistant.test.ts`. Expected: FAIL (`lib/chatbot/secrets/prompt.ts` does not exist and the admin prompt has no SECRETS section), except `keeps the section and the read from Support and Discord` and `reads no secret without a loaded MCP tool`, which pin today's behaviour and already pass.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run `npx jest lib/chatbot __tests__/actions/chatbot.test.ts actions/chatbot && npm run typecheck`. Expected: PASS (the chat suites load no MCP tool, so they read no secret; the partial rows the new tests mock are cast as the file's are, `as never`).
- [ ] **Step 6:** Commit:
  ```bash
  git add lib/chatbot/secrets/prompt.ts lib/chatbot/skills/prompt.ts lib/chatbot/assistant.ts \
    lib/chatbot/secrets/__tests__/prompt.test.ts lib/chatbot/__tests__/assistant.test.ts
  git commit -m "List allowed secrets in the admin assistant prompt"
  ```

### Task 6: Resolve placeholders in MCP tool calls

**Files:**
- Create: `lib/chatbot/secrets/resolve.ts` (`import "server-only"`)
- Modify: `lib/chatbot/mcp/tools.ts` (`executeMcpTool` and its JSDoc; it imports the resolver as `@/lib/chatbot/secrets/resolve`)
- Test: `lib/chatbot/secrets/__tests__/resolve.test.ts`, `actions/chatbot/__tests__/secrets.test.ts` (both `@jest-environment node`)

**Interfaces:**
- Consumes: Task 3's helpers, Task 4's `mcpCallTool` options, Task 2's patterns and events, Task 1's tables.
- Produces:
  ```ts
  export type SecretUse = { secretId: string; secretName: string; argument: string }
  export function resolveSecrets(route: { serverId: string; tool: string }, args: Record<string, unknown>, userId: string): Promise<
    | { kind: "plain" }                               // no placeholder: nothing read
    | { kind: "denied"; message: string }             // ASSISTANT_SECRET_DENIED already logged
    | { kind: "ready"; endpoint: McpEndpoint; args: Record<string, unknown>; redact: (text: string) => string; uses: SecretUse[] }
  >
  /** Called only once mcpCallTool's onSend ran. One ASSISTANT_SECRET_USED per use, then the throttled lastUsedAt per distinct secret; a failed write logs a warning naming the secret and never throws. */
  export function recordSecretUse(route: { serverId: string; tool: string }, uses: SecretUse[], userId: string): Promise<void>
  ```
  The one read, with `names` the distinct placeholder names:
  ```ts
  prisma.$transaction((tx) => tx.mcpServer.findUnique({
    where: { id: route.serverId },
    select: { url: true, authHeaderName: true, authHeaderSecret: true,
      secretGrants: { where: { tool: route.tool, secret: { name: { in: names } } }, select: { argument: true, secret: { select: { id: true, name: true, value: true } } } } },
  }), { isolationLevel: "RepeatableRead" })
  ```

- [ ] **Step 1: Write the failing `resolve.test.ts`**, calling `executeMcpTool("mcp_sonarr_api", args, "admin-1")` with `@/lib/prisma`, `@/lib/admin`, `@/lib/chatbot/mcp/client` (`mcpListTools`, `mcpCallTool`), `logAuditEvent` (with the real `AuditEventType`) and a shared `mockLogger` mocked. `mcpServer.findMany` gives `srv-1` "Sonarr" at `https://stale.example.com/mcp` with `enabledTools: ["api"]`; `$transaction` runs its callback on `asTransactionClient(prismaMock)`; `mcpServer.findUnique` gives `{ url: "https://mcp.example.com/mcp", authHeaderName: "Authorization", authHeaderSecret: "Bearer srv", secretGrants }`, built with `grant(argument, name = "SONARR_KEY", value = VALUE)`, which gives `{ argument, secret: { id: \`sec-${name}\`, name, value } }`, and `VALUE = "s3cr3t-Value_123"`. `mcpListTools` resolves `{ ok: true, data: [{ name: "api", description: "", inputSchema: { type: "object" }, readOnlyHint: false }] }`. Unless a test says otherwise, `mcpCallTool` calls `options.onSend?.()`, then resolves `{ ok: true, data }`, where `data` is `` `echo ${JSON.stringify(args)}` `` passed through `options.redact` when the call has options, as the real client does.
  - `runs a call without placeholders exactly as today`: no `$transaction`, and `mcpCallTool` got exactly the route's endpoint, `"api"` and the arguments (three arguments).
  - `substitutes a whole value and one inside a longer string`: `{ apiKey: "{{secret:SONARR_KEY}}", auth: "Bearer {{secret:SONARR_KEY}}", q: "x" }`, granted on `apiKey` and `auth`, calls `mcpCallTool` with the read's endpoint, `"api"`, `{ apiKey: VALUE, auth: \`Bearer ${VALUE}\`, q: "x" }` and `{ crossOriginBody: "refuse", redact: expect.any(Function), onSend: expect.any(Function) }`; `$transaction` got `{ isolationLevel: "RepeatableRead" }`, and `findUnique`'s grant `where` holds `tool: "api"`.
  - `allows a placeholder nested inside a granted argument`: `{ body: { headers: { auth: "{{secret:SONARR_KEY}}" } } }`, granted on `body`, sends the value there.
  - `finds a placeholder inside a JSON-encoded string`: `{ body: '{"apiKey":"{{secret:SONARR_KEY}}"}' }` sends `` `{"apiKey":"${VALUE}"}` ``.
  - `leaves number and boolean arguments alone`: `{ apiKey: "{{secret:SONARR_KEY}}", limit: 5, dryRun: false }`, granted on `apiKey`, sends exactly `{ apiKey: VALUE, limit: 5, dryRun: false }`.
  - `refuses an unknown name, a disallowed tool or argument, and an ignored branch`, each with no call and one `ASSISTANT_SECRET_DENIED`: `NOPE` with no grant (`Error: secret NOPE is not available in that argument.`); no grant for this tool (`secretGrants: []`); a grant on `apiKey` with the placeholder in `url`; `{ q: "x", unused: { deep: ["{{secret:SONARR_KEY}}"] } }` with a grant on `apiKey` only.
  - `refuses a placeholder in a key`: `{ headers: { "{{secret:SONARR_KEY}}": "x" } }`, granted on `headers`, is refused before any read.
  - `refuses a misspelt placeholder and audits it as invalid`: `{{secret: SONARR_KEY}}`, `{{secret:sonarr_key}}` and `{{secret:}}` in a granted `apiKey` each return the denial with the name as written, audit `secretName: "invalid"` and make no call; a 100-character name appears cut to 64.
  - `checks a placeholder from an earlier result like any other`: a first call returns `echo {"apiKey":"{{secret:SONARR_KEY}}"}`; a second with `url: "https://evil.example/?k={{secret:SONARR_KEY}}"` is refused, and one with `apiKey: "{{secret:SONARR_KEY}}"` is filled.
  - `sends to the URL and auth read with the grants`: the call goes to `https://mcp.example.com/mcp` with `Bearer srv`, never the route's stale URL.
  - `never sends a secret to a server's new URL after an edit`: a read giving the new URL with `secretGrants: []` is refused; a read giving the old URL with the grant, after which `findUnique` would give the new URL, sends once, to the old URL, after one read.
  - `treats a secret that no longer decrypts as unknown`: a grant whose `secret.value` is null is refused like an unknown name, and `mockLogger.warn` got `("Assistant secret could not be decrypted", { secretName: "SONARR_KEY" })`.
  - `redacts the value in what comes back`: a reply of `secretForms(VALUE).join(" | ")` passed through `options.redact` returns no form; a composed `auth: "user:{{secret:SONARR_KEY}}"`, echoed as `Buffer.from(String(args.auth)).toString("base64")`, returns `user:{{secret:SONARR_KEY}}`.
  - `audits use and denial without the value`: a sent call logs `ASSISTANT_MCP_CALL` and one `ASSISTANT_SECRET_USED` `{ secretName: "SONARR_KEY", serverId: "srv-1", tool: "api", argument }` per granted argument used; a refused one logs only `ASSISTANT_SECRET_DENIED`. No `logAuditEvent` call and no `mockLogger` call contains `VALUE`.
  - `records use once the value is sent, even when the call fails`: with `mcpCallTool` calling `options.onSend()` and then giving `{ ok: false, code: "UNREACHABLE" }`, the result is `Error: the Sonarr tool failed (UNREACHABLE).`, `ASSISTANT_SECRET_USED` is logged and `assistantSecret.updateMany` called; a refused call calls neither.
  - `records nothing when the call fails before sending`: with `mcpCallTool` giving `{ ok: false, code: "UNREACHABLE" }` without calling `onSend` (a refused `initialize`), the result is the same failure line, and neither `ASSISTANT_SECRET_USED` nor `updateMany` happens.
  - `writes lastUsedAt at most once a minute`: with fake timers at `T`, a call using the secret in two arguments calls `updateMany` once, with `{ where: { id: "sec-SONARR_KEY", OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(T - 60_000) } }] }, data: { lastUsedAt: new Date(T) } }`.
  - `is called only from executeMcpTool`: every import, export-from, `require` and `import()` specifier in the non-test `.ts` and `.tsx` files under `lib`, `actions` and `app` is resolved (an `@/` one from the root, a relative one from the importing file's folder, the extension and a trailing `/index` dropped), and the files whose specifier resolves to `lib/chatbot/secrets/resolve` are exactly `["lib/chatbot/mcp/tools.ts"]`.
- [ ] **Step 2: Write the failing `actions/chatbot/__tests__/secrets.test.ts`**, set up like `actions/chatbot/__tests__/injection.test.ts` with two differences. `createLogger` returns one shared `mockLogger` (`debug`, `info`, `warn` and `error` as `jest.fn()`). `@/lib/connections/http` is mocked in place of a connection, so the real MCP client runs, with its own logging, redaction and cut: `fetchWithSafeRedirects` answers by request, `initialize` with an `mcp-session-id` header, `notifications/initialized` with 202, `tools/list` with `{ tools: [{ name: "lookup", inputSchema: { type: "object" } }] }`, `tools/call` with the test's reply (by default a text part `` `echo ${arguments.key}` ``), and DELETE with 200. Server `srv-1` "Lookup" has `enabledTools: ["lookup"]`; the prompt read gives `E2E_KEY` granted on `(srv-1, lookup, key)`; the grant read gives that grant with `VALUE = "v4lue/for&the-test"`; `assistantSecret.updateMany` resolves `{ count: 1 }`. The model calls `mcp_lookup_lookup` with `'{"key":"{{secret:E2E_KEY}}","query":"x"}'`, then answers. Each test first checks two controls: the `tools/call` request body holds `VALUE`, and `mockLogger.info` got `"Audit event: ASSISTANT_SECRET_USED"`. Then none of these contains `v4lue` (the value's start, so an escaped copy counts too): the first call's `system`; the second call's `messages` and `usagePrompt`; `chatConversationMessage.createMany`'s data (the stored turn and its tool log); `auditLog.create`'s data; any call of any `mockLogger` method.
  - `stores and logs only the placeholder when the call succeeds`: the tool result the model got is `{ untrusted_data: "echo {{secret:E2E_KEY}}" }`.
  - `stores and logs only the placeholder when the call fails`, with `it.each` over a 401 reply to `tools/call` and a JSON-RPC error reply, each with `VALUE` in its body, since failures are reported by code only.
  - `stores only the placeholder when the server escapes the value in JSON`: `tools/call` answers the text `'{"echo":"v4lue\\/for\\u0026the-test"}'`, and the tool result the model got is `{ untrusted_data: { echo: "{{secret:E2E_KEY}}" } }`.
- [ ] **Step 3:** Run `npx jest lib/chatbot/secrets/__tests__/resolve.test.ts actions/chatbot/__tests__/secrets.test.ts`. Expected: FAIL (placeholders are sent as written), except `runs a call without placeholders exactly as today` and `records nothing when the call fails before sending`, which pin today's behaviour and already pass.
- [ ] **Step 4: Implement** `resolveSecrets`:
  1. `findPlaceholders(args)`; none gives `plain`.
  2. Refuse the first placeholder that is in a key or whose name fails `SECRET_NAME_PATTERN`, before any read.
  3. The one read above, with a comment: with no relation-join strategy a nested read can be several statements, and REPEATABLE READ makes them one snapshot, so a server edited mid-call shows its old URL with its grants, or its new URL without them.
  4. In `findPlaceholders` order, refuse the first placeholder with no grant for its name and argument, or whose `secret.value` reads as null (with the warning above); a missing server refuses the first.
  5. Fill the copy with `fillPlaceholders`. `secretRedactor` gets each value with `{{secret:NAME}}` and each `composed` string with its original; `uses` are the distinct secret and argument pairs; the endpoint is the read's `url`, `authHeaderName` and `authHeaderSecret`.

  A refusal logs `ASSISTANT_SECRET_DENIED` with the route's `serverId` and `tool` and the pattern-checked name and argument, and returns the denial for the name as written. In `executeMcpTool`, after the route: `plain` runs today's code unchanged; `denied` returns its message; `ready` logs `ASSISTANT_MCP_CALL`, calls `mcpCallTool(call.endpoint, route.tool, call.args, { crossOriginBody: "refuse", redact: call.redact, onSend })` with an `onSend` that marks the call sent, awaits `recordSecretUse` only when it was, and returns the data, or the usual failure line through `call.redact`.
- [ ] **Step 5:** Run `npx jest lib/chatbot actions/chatbot __tests__/actions/chatbot.test.ts && npm run typecheck`. Expected: PASS.
- [ ] **Step 6:** Commit:
  ```bash
  git add lib/chatbot/secrets/resolve.ts lib/chatbot/mcp/tools.ts \
    lib/chatbot/secrets/__tests__/resolve.test.ts actions/chatbot/__tests__/secrets.test.ts
  git commit -m "Resolve secret placeholders in MCP tool calls"
  ```

### Task 7: MCP server saves drop grants, and discovery lists arguments

**Files:**
- Modify: `actions/admin/assistant-sources.ts` (`saveMcpServer`, `deleteMcpServer`, `discoverMcpTools` and their JSDoc)
- Modify: `components/admin/settings/mcp-server-form.tsx` (the save toast, ~line 60)
- Modify (generated): `lib/mcp/action-docs.generated.ts`, via `npm run mcp:docs`
- Test: `actions/admin/__tests__/assistant-sources.test.ts`, `components/admin/settings/__tests__/assistant-section.test.tsx`

**Interfaces:**
- Produces:
  - `saveMcpServer` → `ok({ id: string; grantsRemoved?: number })`. A save is a repoint when a stored row exists and its `url`, `authHeaderName` or `authHeaderSecret` differs from what is written. A repoint runs `prisma.$transaction([prisma.mcpServer.update(…), prisma.assistantSecretGrant.deleteMany({ where: { serverId: id } })])`; any other save keeps today's single write. `grantsRemoved` is in the result and the audit only when above 0.
  - `deleteMcpServer` runs `prisma.$transaction([prisma.assistantSecretGrant.count({ where: { serverId: id } }), prisma.mcpServer.deleteMany({ where: { id } })])`; the cascade removes the grants, and the audit carries the count the same way.
  - `discoverMcpTools` → `ok({ tools: { name: string; description: string; readOnlyHint: boolean; arguments: string[] }[] })`, where `arguments` are the keys of `inputSchema.properties` when it is a plain object, in schema order, those matching `ARGUMENT_NAME_PATTERN`, at most 50.
  - JSDoc. `saveMcpServer`: "Add or change an MCP server. A new URL, auth header name or header value removes the server's secret grants, so a repointed server receives no secret until an admin grants it again." `discoverMcpTools`: "The tools a saved MCP server lists, with each tool's top-level argument names, for the per-tool switches and the secret grant picker."
  - The form's toast when `grantsRemoved` is set: "MCP server saved. Its address or auth changed, so its secret grants were removed."

- [ ] **Step 1: Write the failing tests** in `assistant-sources.test.ts`, whose `beforeEach` adds `prismaMock.$transaction.mockImplementation(async (ops: unknown) => Promise.all(ops as Promise<unknown>[]))` and `assistantSecretGrant.deleteMany` resolving `{ count: 2 }`:
  - `removes the server's grants when its URL changes`: `{ ...MCP, id: "m1", url: "https://mcp.example.com/other", authHeaderSecret: "" }` over `STORED` deletes with `{ where: { serverId: "m1" } }`, returns `{ id: "m1", grantsRemoved: 2 }` and audits `{ kind: "mcp", action: "saved", id: "m1", grantsRemoved: 2 }`.
  - `… when its auth header name changes`: `authHeaderName: "X-Api-Key", authHeaderSecret: "Bearer old"`.
  - `… when its auth header value changes`: `authHeaderSecret: "Bearer new"`.
  - `keeps the grants when the server is turned off and on`: saving with `isActive: false`, then `true`, at the same URL with a blank value calls neither `$transaction` nor `deleteMany`, and audits no `grantsRemoved`.
  - `keeps the grants when the server is renamed or its tools change`: over `STORED`, saving `{ ...MCP, id: "m1", name: "Renamed", enabledTools: ["other"], authHeaderSecret: "" }` calls neither `$transaction` nor `assistantSecretGrant.deleteMany`, and audits exactly `{ kind: "mcp", action: "saved", id: "m1" }`.
  - `deleting a server audits the grants it removed`, an `it.each` over the count that `assistantSecretGrant.count` resolves, with `mcpServer.deleteMany` resolving `{ count: 1 }`: 3 audits `grantsRemoved: 3`; 0 leaves the key out.
  - Change `lists the tools with the stored credentials and no input schemas` to expect `arguments: []`, and add `lists each tool's top-level argument names`: properties `{ apiKey: {}, "api key": {}, query: {} }` give `["apiKey", "query"]`; `properties: []`, and no `properties`, give `[]`.
  - `assistant-section.test.tsx`, `says when a save removed secret grants`: `saveMcpServer` resolving `{ success: true, data: { id: "m1", grantsRemoved: 2 } }` shows the toast above. The existing `lists a server's tools, leaves new ones off and saves the checkboxes` mock (~line 90) gains `arguments: []` on both tools, since `discoverMcpTools`' result type now requires it.
- [ ] **Step 2:** Run `npx jest actions/admin/__tests__/assistant-sources.test.ts components/admin/settings/__tests__/assistant-section.test.tsx`. Expected: the new tests FAIL (saves never delete grants, a delete audits no count, `discoverMcpTools` returns no `arguments`, and the form only toasts "MCP server saved"), except the two keep-the-grants tests and the count-0 delete case, which pin today's behaviour and already pass.
- [ ] **Step 3:** Implement, then run `npm run mcp:docs`.
- [ ] **Step 4:** Run `npx jest actions/admin lib/mcp components/admin/settings && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit:
  ```bash
  git add actions/admin/assistant-sources.ts components/admin/settings/mcp-server-form.tsx lib/mcp/action-docs.generated.ts \
    actions/admin/__tests__/assistant-sources.test.ts components/admin/settings/__tests__/assistant-section.test.tsx
  git commit -m "Remove a repointed MCP server's secret grants"
  ```

### Task 8: Secret actions and their settings loader, off /api/mcp

**Files:**
- Create: `actions/admin/assistant-secrets.ts`, `lib/data/assistant-secrets.ts` (`import "server-only"`)
- Modify: `lib/mcp/action-modules.ts` (`EXCLUDED_MODULES`), `lib/chatbot/mcp/tools.ts` (drop `@internal` from `mcpToolName`)
- Test: `actions/admin/__tests__/assistant-secrets.test.ts` (`@jest-environment node`), `lib/data/__tests__/assistant-secrets.test.ts`, `lib/mcp/__tests__/catalog.test.ts`, new `lib/mcp/__tests__/no-secret-loaders.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** Add or change an assistant secret: keep the loaded grants still ticked, by id, and create the new ticks. */ export const saveAssistantSecret
  // input { id?, name, description, value?, keep: string[] (grant ids, at most 100), add: { serverId, tool, argument }[] (at most 100) } -> ok({ id })
  /** Remove an assistant secret and its grants. */ export const deleteAssistantSecret  // { id } -> ok(null)

  export interface AssistantSecretGrantSettings { id: string; serverId: string; serverName: string; tool: string; argument: string; target: string }  // `${mcpToolName(serverName, tool)}.${argument}`
  export interface AssistantSecretSettings { id: string; name: string; description: string; saved: SavedSecret; lastUsedAt: Date | null; grants: AssistantSecretGrantSettings[] }
  export async function getAssistantSecrets(): Promise<AssistantSecretSettings[]>
  ```
- Save, checking in this order:
  1. `isEncryptionConfigured()`, else `fail("UPSTREAM_UNAVAILABLE", 'Saving a secret needs an encryption key: set ENCRYPTION_KEYS (docs/operations.md, "Encryption keys").')`, as the Stripe and Redis refusals do.
  2. A stored row for `id`, else `NOT_FOUND` "That secret no longer exists".
  3. The trimmed value: required on create (`VALIDATION`, `fieldErrors.value` "Enter the value"); under 8 characters refused on create and on update (`fieldErrors.value` "Use at least 8 characters. A shorter credential belongs in the MCP server's auth header.").
  4. A description that holds the value (the trimmed new value, or on an update with a blank value the stored one, when it reads): `VALIDATION`, `fieldErrors.description` "Keep the value out of the description: the assistant reads it." The spec keeps a value out of the prompt, and the description goes in it.
  5. A name in use: `CONFLICT`, `fieldErrors.name` "Already in use".
  6. Every `add` grant's server exists, else `VALIDATION` "An MCP server in the allowed tools no longer exists". A `keep` id needs no check: one that is gone matches nothing.

  Zod: name `z.string().trim().regex(SECRET_NAME_PATTERN, "Use capitals, digits and underscores, starting with a capital")`; description `z.string().trim().max(300)`; value `z.string().max(4000).optional()`; `keep` `z.array(recordId).max(100)`; `add` `z.array(grant).max(100)`, grant `{ serverId: recordId, tool: z.string().min(1).max(128), argument: z.string().regex(ARGUMENT_NAME_PATTERN) }`, deduplicated. Create writes `prisma.assistantSecret.create({ data: { name, description, value, grants: { create: add } } })` and ignores `keep`. Update is one batch, in this order (Settled #13): `prisma.assistantSecret.update({ where: { id }, data: { name, description, ...(value && { value }) } })`, `prisma.assistantSecretGrant.deleteMany({ where: { secretId: id, id: { notIn: keep } } })`, and, only when `add` is not empty, `prisma.assistantSecretGrant.createMany({ data: <add, each with secretId: id>, skipDuplicates: true })`. A kept id that a repoint removed is never re-created. Then audit and `revalidatePath("/admin/settings")`; rate limit `{ name: "admin" }`. The module JSDoc says why it is not an MCP tool.
- Loader: `assertAdmin()`, then `findMany({ orderBy: { name: "asc" }, select: { id, name, description, value, lastUsedAt, grants: { select: { id, serverId, tool, argument, server: { select: { name: true } } } } } })`. `saved` is `{ last4: "", origin: null }`, plus `unreadable: true` when `value` reads as null, so no character of a value reaches the browser and the list can say "Set". Grants are sorted by `target`, and `value` is never returned.

- [ ] **Step 1: Write the failing action tests**, with the mock block of `assistant-skills.test.ts` plus `@/lib/security/crypto` (`isEncryptionConfigured` true in `beforeEach`), `$transaction` resolving its array as in Task 7, and rows from `buildAssistantSecret`:
  - `refuses a member`: both actions give `FORBIDDEN` and write nothing.
  - `refuses to save without an encryption key`: `UPSTREAM_UNAVAILABLE`, no write.
  - `refuses a short value on create and on update`: `"1234567"` either way, and a blank value on create, give `VALIDATION` with `fieldErrors.value`.
  - `trims the value before checking its length`: `"  abcdefg \n"` is refused; `" abcdefgh\n"` is stored as `abcdefgh`.
  - `keeps the stored value when blank on update`: `update`'s data has no `value` key.
  - `creates a secret with its grants and audits it`: an `add` grant given twice is created once; the audit is `{ kind: "secret", action: "saved", id }`; the result is `{ success: true, data: { id } }` and does not contain the value.
  - `keeps loaded grants by id and adds new ones on update`: for `s1` with `keep: ["g1"]` and `add: [{ serverId: "m1", tool: "api", argument: "query" }]`, `$transaction` gets three operations: the `update` (with no `grants` key), `assistantSecretGrant.deleteMany({ where: { secretId: "s1", id: { notIn: ["g1"] } } })` and `assistantSecretGrant.createMany({ data: [{ serverId: "m1", tool: "api", argument: "query", secretId: "s1" }], skipDuplicates: true })`.
  - `does not restore a grant a server save removed`: the stored secret has no grants left, and `keep: ["g-gone"], add: []` deletes with `{ where: { secretId: "s1", id: { notIn: ["g-gone"] } } }` and calls no `createMany`.
  - `refuses a description that holds the value`: on create, value `abcdefgh12` with description `"key abcdefgh12"`; on update with a blank value, a description holding the stored `abcdefgh1234`. Both give `VALIDATION` with `fieldErrors.description`, and nothing is written.
  - `validates names and arguments`: the names `sonarr_key`, `1KEY` and `"A".repeat(65)`, and the `add` argument `api key`, give `VALIDATION`.
  - `rejects a name in use`, `reports an unknown id`, `refuses a grant on a server that is gone` (an `add` grant).
  - `deletes and audits`: `{ kind: "secret", action: "deleted", id }`; a `count: 0` delete gives `NOT_FOUND`.
- [ ] **Step 2: Write the failing loader and MCP tests.**
  - `lib/data/__tests__/assistant-secrets.test.ts`: `refuses a non-admin before reading`; `never returns a value`: with value `abcdefgh1234`, the JSON has no `abcdefgh1234`, `assertNoSecretKeys` passes and `saved` is `{ last4: "", origin: null }`, and a null value gives `unreadable: true`; `names each grant's target as the model sees it`: server "Sonarr 2", tool `api` and argument `apiKey` give `mcp_sonarr_2_api.apiKey`, sorted by target.
  - `catalog.test.ts`, `leaves the assistant secret actions off MCP`: `EXCLUDED_MODULES["admin/assistant-secrets"]` is "carries credential values", and neither `toolName("saveAssistantSecret")` nor `toolName("deleteAssistantSecret")` is a tool.
  - `no-secret-loaders.test.ts`, `exposes no loader that reads assistant secrets`, covering every loader rather than only the ones `lib/mcp` imports today:
    - Of the non-test `.ts` files under `lib/data` and `lib/mcp`, exactly `["lib/data/assistant-secrets.ts"]` match `/assistantsecret|secretgrants/i` (both delegates, `McpServer.secretGrants` and `getAssistantSecrets`, in any case). A self-check: the pattern matches `prisma.mcpServer.findMany({ select: { secretGrants: { select: { secret: true } } } })` and `await getAssistantSecrets()`.
    - With specifiers resolved as in Task 6's import test and `import type` skipped, no non-test file under `lib`, `actions`, `app` or `components` other than `app/admin/settings/page.tsx` imports `lib/data/assistant-secrets`, so no executor that `/api/mcp`'s assistant tools reach reads it either. The control: the same scan finds `lib/mcp/read-tools-community.ts` among the importers of `lib/data/assistant-sources`.
- [ ] **Step 3:** Run `npx jest actions/admin/__tests__/assistant-secrets.test.ts lib/data/__tests__/assistant-secrets.test.ts lib/mcp`. Expected: FAIL (`actions/admin/assistant-secrets.ts` and `lib/data/assistant-secrets.ts` do not exist, and `admin/assistant-secrets` is not in `EXCLUDED_MODULES`).
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run `npx jest actions/admin lib/data lib/mcp __tests__/security && npm run typecheck`. Expected: PASS (`lists every actions file` passes once the module is excluded).
- [ ] **Step 6:** Commit:
  ```bash
  git add actions/admin/assistant-secrets.ts lib/data/assistant-secrets.ts lib/mcp/action-modules.ts lib/chatbot/mcp/tools.ts \
    actions/admin/__tests__/assistant-secrets.test.ts lib/data/__tests__/assistant-secrets.test.ts \
    lib/mcp/__tests__/catalog.test.ts lib/mcp/__tests__/no-secret-loaders.test.ts
  git commit -m "Add assistant secret actions and their settings loader"
  ```

### Task 9: Secrets block in Settings

**Files:**
- Create: `components/admin/settings/assistant/secrets-block.tsx`, `secret-form.tsx`, `secret-grants-field.tsx` (each `"use client"` and under 300 lines)
- Modify: `components/admin/settings/sections/assistant-section.tsx` (a `secrets` prop, the fourth block, JSDoc), `app/admin/settings/page.tsx` (`getAssistantSecrets()` in the `Promise.all`, passed as `secrets`)
- Modify: `components/admin/settings/__tests__/assistant-section.test.tsx` (`secrets={[]}` on every render; mock `@/actions/admin/assistant-secrets`; "says none are set up yet" also expects `settings-secret-list` to read "None yet.")
- Test: `components/admin/settings/__tests__/secrets-block.test.tsx`

**Interfaces:**
- Consumes: Task 8's types and actions; `discoverMcpTools` with `arguments` (Task 7); `McpServerSettings`; `SettingsSheet`, `SheetForm`, `useSettingsForm`, `SettingsFormFooter`, `SecretInput`, `Input`, `FormField`, `Checkbox`, `Label`, `Badge`, `Time`, `Spinner`, `ConfirmDialog` and `useToast`.
- Produces:
  ```ts
  export function SecretsBlock({ secrets, servers }: { secrets: AssistantSecretSettings[]; servers: McpServerSettings[] })
  export function SecretForm({ secret, servers, ...controls }: { secret: AssistantSecretSettings | null; servers: McpServerSettings[] } & SheetFormControls)
  export type SecretToolChoice = { serverId: string; tool: string; arguments: string[] }
  export function SecretGrantsField(props: { value: SecretToolChoice[]; onChange: (next: SecretToolChoice[]) => void; servers: McpServerSettings[]; granted: AssistantSecretGrantSettings[]; disabled: boolean; error?: string })
  export function AssistantSection({ sources, secrets }: { sources: AssistantSources; secrets: AssistantSecretSettings[] })
  ```
- UI decisions:
  - Heading "Secrets". Both Sheets' description: "The assistant passes a secret to the tool arguments you allow, written as {{secret:NAME}}, and never sees its value." The Add Sheet's title is "Add a secret".
  - A row: the name (mono); its targets joined by ", ", or "No allowed tools"; a "Set" badge (`success`), or "Enter it again" (`warning`) when `saved.unreadable`; "Last used" with `Time`, or "Never used"; Edit.
  - Fields: Name ("Capitals, digits and underscores. Skills write it as {{secret:NAME}}."); Description, optional ("Shown to the assistant beside the name. Never put the value here."); Value, a `SecretInput` with `saved` and `noun="value"`, required on create ("At least 8 characters. Encrypted, and never shown again."); Allowed tools.
  - Allowed tools, under that heading, show the spec's grant copy: "A grant means this tool may receive this secret in this argument, and you trust what the tool does with it there. A tool that forwards the argument anywhere (a body it posts) is trusted with the secret, anywhere inside that argument, nested fields included." Then one `Checkbox` row for each enabled tool of each active server, and for each tool the secret already has a grant on, marked "Not offered to the assistant now" when its server is off or the tool is no longer enabled; each row shows the tool name with the server name beside it, and its `Checkbox` is named `Allow ${tool} on ${serverName}` (`aria-label`, as the MCP form's are). With none: "Allow a tool on an MCP server first."
  - On open, and when a tool is ticked, the form lists each active server with a ticked, still-enabled tool once (`discoverMcpTools({ id })`, kept per server id) and shows one `Checkbox` per argument, named `Allow in ${argument} of ${tool} on ${serverName}`: the listed `arguments` plus that tool's ticked ones. A tool on an off server, or one no longer enabled, is never listed and shows its granted arguments only, so the form never sends an off server's auth header. A `Spinner` shows while listing; a failure shows "Could not list this tool's arguments." and keeps the ticked ones.
  - Save sends each ticked argument that matches a loaded grant as that grant's id in `keep`, and every other ticked argument in `add`. A ticked tool with no argument shows "Choose at least one argument for each allowed tool." and calls nothing. A save toasts "Secret saved" and empties the value field (the form's save result keeps the other fields, as the skill form's does), and the server's `fieldErrors` show under name, description and value.
  - Delete confirm: title `Remove ${name}?`, description `Calls that use {{secret:${name}}} are refused from now on.` A removal closes the Sheet with no toast, as the skill form's does.
  - Test ids: `settings-secret-list`, `settings-secret-{id}`, `settings-secret-targets`, `settings-secret-set`, `settings-secret-unreadable`, `settings-secret-last-used`, `settings-secret-add-open`, `settings-secret-edit-open`, `settings-secret-add-sheet` and `settings-secret-edit-sheet` (the `sheetTestId`s), `settings-secret-form`, `settings-secret-name`, `settings-secret-description`, `settings-secret-value`, `settings-secret-tools`, `settings-secret-tool-row-{serverId}-{tool}` (the row, which carries "Not offered to the assistant now"), `settings-secret-tool-{serverId}-{tool}`, `settings-secret-args-{serverId}-{tool}`, `settings-secret-arg-{serverId}-{tool}-{argument}`, `settings-secret-tools-error`, `settings-secret-delete`, `settings-secret-remove` and `settings-secret-remove-confirm`. The `settings-secret-tool-…` and `settings-secret-arg-…` ids go on the `Checkbox` itself (Base UI's `role="checkbox"` root), so `check()` and `user.click` reach it. Both Sheets and the footer take `id="secret"`, which gives `settings-secret-save`, `settings-secret-cancel` and `settings-secret-discard-dialog`.

- [ ] **Step 1: Write the failing `secrets-block.test.tsx`**, mocking both action modules and the toast, and make the `assistant-section.test.tsx` changes in Files. Servers: `m1` "Sonarr 2", active, `["api", "queue"]`; `m2` "Old", off, `["api"]`. `discoverMcpTools` for `m1` resolves `api` with `["apiKey", "query"]`, `queue` with `["key"]` and `delete_all` (listed, not enabled) with `[]`.
  - `says none are set up yet`: with no secrets, `settings-secret-list` contains "None yet.".
  - `lists each secret with its tools, Set and its last use`: `settings-secret-s1` shows `SONARR2_KEY`, `mcp_sonarr_2_api.apiKey`, "Set" and "Never used"; a secret with `lastUsedAt: new Date("2026-11-01T10:00:00Z")` has a `settings-secret-last-used` holding a `time` element whose `dateTime` is `2026-11-01T10:00:00.000Z`, and no "Never used"; an unreadable secret shows `settings-secret-unreadable`.
  - `adds a secret with a grant`, in this order: the grant copy shows, there is no `settings-secret-tool-m2-api` (an off server), and nothing is listed before a tick. Ticking `getByRole("checkbox", { name: "Allow api on Sonarr 2" })` calls `discoverMcpTools` once, with `{ id: "m1" }`, and still there is no `settings-secret-tool-m1-delete_all`. Ticking `settings-secret-tool-m1-queue` makes no second call and shows `settings-secret-arg-m1-queue-key`; untick `queue`. Ticking `settings-secret-arg-m1-api-apiKey`, filling `SONARR2_KEY` and `abcdefgh1` and saving calls `saveAssistantSecret({ name: "SONARR2_KEY", description: "", value: "abcdefgh1", keep: [], add: [{ serverId: "m1", tool: "api", argument: "apiKey" }] })` and toasts "Secret saved".
  - `asks for an argument for each allowed tool`: ticking `settings-secret-tool-m1-api`, filling the name and value and saving shows `settings-secret-tools-error` with "Choose at least one argument for each allowed tool.", and `saveAssistantSecret` is not called.
  - `keeps grants the form cannot list`: a secret with grants `g1` (`m2`, `api`, `apiKey`), `g2` (`m1`, `old`, `key`) and `g3` (`m1`, `api`, `apiKey`), with `discoverMcpTools` for `m1` resolving `{ success: false, code: "UPSTREAM_UNAVAILABLE", error: "x" }`. `settings-secret-tool-row-m2-api` and `settings-secret-tool-row-m1-old` show "Not offered to the assistant now"; `discoverMcpTools` is called once, with `{ id: "m1" }`, and never with `{ id: "m2" }`; `settings-secret-args-m1-api` shows "Could not list this tool's arguments."; the three granted arguments show ticked; saving after a description change sends `keep` holding `g1`, `g2` and `g3` (any order) and `add: []`.
  - `shows the server's field errors`: a `fieldErrors.value` and a `fieldErrors.description` from `saveAssistantSecret` show under those fields.
- [ ] **Step 2:** Run `npx jest components/admin/settings`. Expected: FAIL (`components/admin/settings/assistant/secrets-block.tsx` does not exist, and the section has no `settings-secret-list` for "says none are set up yet"); the other tests PASS.
- [ ] **Step 3:** Build the three components, then wire the section and the page.
- [ ] **Step 4:** Run `npx jest components/admin/settings lib/mcp/__tests__/no-secret-loaders.test.ts && npm run typecheck && npm run lint && npm run design:check`. Expected: PASS, with no new design-system counts; the loader guard still passes, with the settings page as the loader's one importer.
- [ ] **Step 5:** Commit:
  ```bash
  git add components/admin/settings/assistant/secrets-block.tsx components/admin/settings/assistant/secret-form.tsx \
    components/admin/settings/assistant/secret-grants-field.tsx components/admin/settings/sections/assistant-section.tsx \
    app/admin/settings/page.tsx components/admin/settings/__tests__/assistant-section.test.tsx \
    components/admin/settings/__tests__/secrets-block.test.tsx
  git commit -m "Add secrets to the assistant settings"
  ```

### Task 10: Docs, end-to-end check, gates and security review

**Files:**
- Modify: `docs/assistant.md` (a `## Secrets` section after `## Skills`; the opening paragraph and the MCP servers bullets mention secrets)
- Modify: `docs/mcp.md` ("Left out" adds assistant secrets, whose actions carry credential values; the redaction paragraph's "every encrypted credential column" adds "but not `AssistantSecret.value`, sealed as free text so that its plain name redacts nothing; no tool or loader returns it")
- Modify: `docs/roles.md` ("The audit log for a Support user": the used summary names the secret and the argument, both an admin's choices; the refused summary names neither, because the model wrote both; neither shows a value)
- Create: `e2e/mocks/mcp-server.ts`, `e2e/admin/settings-assistant-secrets.spec.ts`

**Interfaces:**
- Produces: `startMockMcp(): Promise<{ url: string; server: Server }>` (the URL ends in `/mcp`) and `MOCK_MCP_TOOL = { name: "lookup", description: "Looks up a title", inputSchema: { type: "object", properties: { apiKey: { type: "string" }, query: { type: "string" } } }, annotations: { readOnlyHint: true } }`. The mock answers JSON-RPC POSTs (`initialize` with an `mcp-session-id` header; `notifications/initialized` with 202; `tools/list`; `tools/call` with `{ content: [{ type: "text", text: "ok" }] }`) and DELETE.
- Consumes: Task 9's test ids, `adminPage` from `e2e/fixtures/auth.ts`, and `createE2EPrismaClient`.

- [ ] **Step 1:** Write `## Secrets` in `docs/assistant.md`, covering:
  - Settings, Assistant sources, Secrets: the name rule, the description the assistant sees (a description that holds the value is refused), the value (at least 8 characters, trimmed, encrypted, never shown again, kept when left blank), and the refusal without an encryption key;
  - allowed tools: a grant is a server, a tool and one top-level argument from the tool's input schema, with the picker's copy. Only top-level arguments whose names are letters, digits, `_`, `.` or `-` (at most 64 characters) are offered, and at most the first 50 of a tool's. The form lists arguments only for an active server's enabled tools, so an off server is never contacted. Grants on an off server or a tool no longer enabled are kept. A new URL, auth header name or header value removes the server's grants (the save says so, and the audit counts them); turning it off and on keeps them; deleting it removes them; renaming it keeps them and changes the names the assistant sees. A secret save keeps the grants it loaded by id, so a grant that a server change removed stays removed, even when the Sheet was opened before the change;
  - in the chat: the SECRETS section (names, descriptions and the allowed arguments of loaded tools, admin web chat only); a placeholder can be a whole value or part of one; every `{{secret:…}}` counts, and a misspelt, unknown, ungranted, undecryptable or key placeholder refuses the whole call with the denial message; every placeholder anywhere in the arguments is checked;
  - audit: `ASSISTANT_SECRET_USED` and `ASSISTANT_SECRET_DENIED` with name, server, tool and argument, never the value, and `"invalid"` for a name or argument off its pattern; the refused event's summary names neither, because the model wrote both; the used event and `lastUsedAt` are written once the call is sent, `lastUsedAt` at most once a minute;
  - what is stored: only the placeholder, in the conversation, its tool log, `LLMUsage`, logs and audit; the filled copy goes only to the MCP server;
  - redaction: the forms and their limits (best effort; the grant is the control). A result is matched as received and, while it is still JSON, again after re-serialising, so a server's own escapes and a long number echoed as a JSON number are both covered. Only the call that carried a secret is redacted; another call (in parallel, later, or to another tool) that returns the value is not, so grant only tools whose server you trust not to hand the value back. A call carrying a secret never follows a redirect to another origin;
  - trust: a granted tool is trusted with the secret anywhere in that argument, so a prompt injection can at most send it through a granted argument of that tool; built-in tools and Discord never resolve placeholders; `/api/mcp` can neither read nor save secrets.

  Then the `docs/mcp.md` and `docs/roles.md` lines.
- [ ] **Step 2:** Write the spec, `admin adds a secret with a grant and removes it`, in the manner of `e2e/admin/settings-assistant-skills.spec.ts`:
  - `beforeAll`: start the mock with `startMockMcp()`; delete any `assistantSecret` named `E2E_SECRET` and any `mcpServer` named `E2E MCP`; create that server with `{ url: mock.url, enabledTools: ["lookup"], isActive: true }` and keep its id. `afterAll`: delete both again (the grants cascade), disconnect, and close the mock.
  - The test: go to `/admin/settings#assistant`; open `settings-secret-add-open`; fill the name `E2E_SECRET` and the value `e2e-secret-value`; tick `settings-secret-tool-${serverId}-lookup`, then `settings-secret-arg-${serverId}-lookup-apiKey` once it shows; save, wait for the Sheet to close, expect the `toast` to contain "Secret saved", and dismiss it with `toast-dismiss`. Read the secret's id and grants (`[{ tool: "lookup", argument: "apiKey" }]`) with `createE2EPrismaClient`. The row `settings-secret-${id}` shows `mcp_e2e_mcp_lookup.apiKey` and `settings-secret-set`, and the page never contains `e2e-secret-value`. Remove it with Edit, `settings-secret-delete` and `settings-secret-remove-confirm`; the row is gone and no grant is left.
- [ ] **Step 3:** Run `DATABASE_URL=$E2E_DATABASE_URL npx prisma migrate deploy`, then `E2E_SERVER=prod npx playwright test e2e/admin/settings-assistant-secrets.spec.ts --project=chromium`. Expected: PASS.
- [ ] **Step 4:** Run the gates, with the ratchet last so one commit holds every floor change: `npm run typecheck && npm run lint && npm run knip && node scripts/check-migrations.mjs && npm run env:docs -- --check && npm run design:check && npm run build && node scripts/audit-gate.mjs && node scripts/check-changelog.mjs --base origin/main --head HEAD && npm run test:coverage && node scripts/coverage-ratchet.mjs --update`. Then, on a fresh `_test` database, Schema Drift: `DATABASE_URL=<url> npx prisma migrate deploy && DATABASE_URL=<url> npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`, and `TEST_DATABASE_URL=<url> npm run test:integration`. Expected: all pass.
- [ ] **Step 5:** Commit, adding `jest.coverage-thresholds.json` too if the ratchet changed it:
  ```bash
  git add docs/assistant.md docs/mcp.md docs/roles.md e2e/mocks/mcp-server.ts e2e/admin/settings-assistant-secrets.spec.ts
  git commit -m "Document assistant secrets and cover them end to end"
  ```
- [ ] **Step 6:** Run `/security-review` on the branch and fix what it confirms. Ask it to try:
  - placeholders in keys, nested arrays and JSON strings, misspelt or lowercase names, and a branch the server ignores;
  - the value in logs, audit rows, the tool log, `LLMUsage`, failure lines and thrown errors, on success and on failure;
  - echoes in encodings on and off the list, an all-digit value echoed as a JSON number, and at the 20,000-character cut;
  - 301, 302, 303, 307 and 308 to another origin, and same-origin hops, with and without a secret;
  - the REPEATABLE READ grant read against a concurrent repoint save;
  - `$` patterns in values, and secrets that contain each other;
  - `/api/mcp`: no tool or loader reaches `AssistantSecret`, and leaving `value` out of key-name redaction leaks nothing;
  - the log redactor's verbatim fields passing only names that match their patterns and the `invalid` marker, and the refused summary carrying no model-written text to Support;
  - a Secret Sheet opened before an MCP server repoint and saved after it (`keep` and `add`), and a pasted `enc:v2:…` ciphertext as a value;
  - an MCP server that plants `{{secret:X}}` in a result, then a prompt injection steering it into another tool's argument;
  - two findings that predate Phase 2, to record for the owner and not fix here: `fetchWithSafeRedirects` drops only five header names, so an MCP server saved with another auth header name (`X-Auth-Token`) still sends it across origins on calls without a secret; and `McpServer.authHeaderSecret`, like every credential column outside `FREE_TEXT_FIELDS`, keeps a pasted ciphertext as it is (`encryptSecret`), while `saveMcpServer` is reachable over `/api/mcp`.

  If the review changes anything, re-run Step 4 (and Step 3 when the UI or the actions changed), then `git add` the files it changed and `git commit -m "Address the security review"`.
- [ ] **Step 7:** Push the branch with `git push -u origin HEAD`, then stop and report the gates, the E2E run and the review's outcome. Phase 2 is security work: the pull request is opened only when the owner asks, never before.
