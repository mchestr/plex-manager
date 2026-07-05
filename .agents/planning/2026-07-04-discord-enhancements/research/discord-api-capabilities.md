# Research: Discord API Capabilities

_Sourced from official Discord developer docs (docs.discord.com/developers) and
verified against the installed `discord.js` package._

> **Version note:** `package.json` declares `discord.js@^14.16.3`, but the
> resolved install is **14.25.1** (latest 14.26.4; Node ≥18). All builder /
> interaction APIs referenced below were verified present in 14.25.1.

## 1. Application (slash) commands

- Types: `CHAT_INPUT` (1, typed `/`), `USER` (2, right-click user), `MESSAGE`
  (3, right-click message), `PRIMARY_ENTRY_POINT` (4).
- **Registration is HTTP-only** (needs `applications.commands` scope):
  - Global: `PUT /applications/{id}/commands` — eventually consistent.
  - **Guild: instant** — `PUT /applications/{id}/guilds/{guildId}/commands`. Use
    for dev.
  - Bulk overwrite (`PUT`) is idempotent → the recommended deploy-time pattern.
- Limits: 100 chat-input / 15 user / 15 message commands per app or guild;
  name 1–32, description 1–100; ≤25 options/command; ≤25 choices/option; total
  8000 chars; **200 command-creates/day/guild**.
- Option types include STRING/INTEGER/BOOLEAN/USER/CHANNEL/ROLE/etc. Required
  options precede optional. Subcommands nest **one level** only.
- **Autocomplete** (≤25 dynamic suggestions) — cannot combine with static
  `choices`; server does NOT validate the submitted value, so re-validate.
- **Pros vs `!`-prefix:** discoverable, self-documenting, typed/validated,
  per-command permissions, built-in ephemeral, **no MessageContent intent**.
- **Cons:** deploy-time registration step; rigid schema (free-text `!assistant`
  bridges awkwardly to a single required STRING option + defer). Can run both in
  parallel during migration, but dropping MessageContent requires fully removing
  message-content listening.

## 2. Components & interaction response model

- **3-second ack rule**; interaction **token lives 15 min** for follow-ups.
  Even gateway-delivered interactions are answered over HTTP.
- Callback types: `CHANNEL_MESSAGE_WITH_SOURCE` (4), `DEFERRED_…` (5, "thinking…"
  then edit), `DEFERRED_UPDATE_MESSAGE` (6), `UPDATE_MESSAGE` (7, edit the
  component's message), `AUTOCOMPLETE_RESULT` (8), `MODAL` (9).
- **Ephemeral** = message flag `1<<6` (64) → only invoker sees it. Ideal for
  private stats / errors.
- Components: Action Row (≤5 buttons OR 1 select); Button (`custom_id` 1–100,
  label ≤80, styles incl. Link); String Select (≤25 options); auto-populated
  User/Role/Channel/Mentionable selects; Text Input (modals, ≤4000 chars);
  Modal (1–5 components, title ≤45).
- **UX win:** the current "post 1–5, user types a number, MessageCreate matches
  the reply" media picker → replace with a **String Select or buttons**: user
  clicks → `MESSAGE_COMPONENT` interaction with `custom_id`/`values` → defer if
  slow → `UPDATE_MESSAGE` to collapse into a confirmation. No text parsing, no
  MessageContent intent.

## 3. Embeds

- Fields: title (≤256), description (≤4096), ≤25 fields (name ≤256, value
  ≤1024), footer (≤2048), author (≤256), color, thumbnail/image, timestamp.
- **Combined ≤6000 chars across all embeds; ≤10 embeds/message.**
- Right vehicle for user-facing Wrapped/stats (structured fields, poster
  thumbnail). Paginate large stat sets with buttons rather than overflow.

## 4. Gateway intents — the privacy win

- Privileged: `GUILD_MEMBERS` (1<<1), `GUILD_PRESENCES` (1<<8),
  **`MESSAGE_CONTENT` (1<<15 = 32768)**.
- Without MessageContent, `content`/`embeds`/`attachments`/`components` arrive
  empty EXCEPT: the app's own messages, DMs to the app, messages that @-mention
  the app, and the target of a message context-menu command.
- **Interactions need NO message intent.** A slash-command + components bot needs
  only `Guilds` (or, via HTTP webhook §5, no gateway at all).
- ✅ **Migrating `!finished`/`!help`/`!assistant` to slash commands removes the
  MessageContent privileged intent entirely** — the bot stops receiving every
  message's full text. Also avoids privileged-intent approval friction at 100+
  guilds / 10k+ users. (Unapproved privileged intent → gateway close `4014`.)

## 5. Interactions endpoint (HTTP webhook) vs gateway

- Two **mutually exclusive** delivery methods: gateway `INTERACTION_CREATE`, or
  an **Interactions Endpoint URL** that Discord POSTs to.
- **Why it matters here:** the current bot needs a **distributed lock to keep a
  single gateway websocket** across Next.js replicas. The HTTP-webhook model
  **eliminates the persistent connection** — every replica handles interactions
  as stateless POSTs (e.g. `app/api/discord/interactions/route.ts`), removing the
  singleton/lock requirement. Fits serverless/multi-replica.
- **Trade-off:** HTTP webhook gives interactions ONLY — you lose gateway events
  (MessageCreate, joins, reactions). Aligns with dropping message listening.
  Outbound announcements don't need the gateway (webhooks/REST, §8).
- **Ed25519 signature verification required:** every request carries
  `X-Signature-Ed25519` + `X-Signature-Timestamp`; verify against
  `timestamp + raw body` with the app public key; **respond 401 on failure**
  (Discord probes with bad signatures). Needs the RAW unparsed body. Must also
  answer the `PING` (type 1) with `PONG`.

## 6. Rate limits

- Global 50 req/s per token (**interaction endpoints exempt**). Per-route buckets
  via `X-RateLimit-Bucket`; channels/guilds/webhooks are independent top-level
  resources.
- 429 → honor `retry_after`. >10k invalid (401/403/429) per 10 min → Cloudflare
  IP ban. **discord.js REST already handles bucketing/queuing/backoff.** Don't
  hardcode limits; read the headers.

## 7. Linked Roles / role connection metadata

- **Max 5 metadata records per application** (hard limit). key `[a-z0-9_]` 1–50.
- Value types: integer/datetime/boolean comparators (1–8). Datetime guild values
  are "days before now."
- Define schema: `PUT /applications/{id}/role-connections/metadata`. Push a
  user's values: `PUT /users/@me/applications/{id}/role-connection` (needs
  `role_connections.write`, already used). App writes values; guilds set
  thresholds. Choose the 5 keys carefully (currently uses 2:
  `is_subscribed`, `watched_hours` → 3 slots free).

## 8. Notifications / announcements

- **Channel webhooks: no bot, no token, no gateway** — just the URL. content
  ≤2000, ≤10 embeds, per-message username/avatar override (branded "Plex"
  posts). Non-app-owned webhooks **cannot** send interactive components.
- For one-way announcements (new media, server status, "Wrapped ready") →
  channel webhook is simplest. For interactive posts → bot message / app-owned
  webhook so interactions route back.

## 9. discord.js v14 helpers (verified in 14.25.1)

- Builders: `SlashCommandBuilder` (+ subcommand/group), `ContextMenuCommandBuilder`,
  `EmbedBuilder`, `ActionRowBuilder`, `ButtonBuilder`, `StringSelectMenuBuilder`
  (+ user/role/channel/mentionable), `ModalBuilder`, `TextInputBuilder`.
- REST registration: `new REST({version:'10'}).setToken(t)` +
  `rest.put(Routes.applicationGuildCommands(clientId, guildId), {body})`.
- Interaction classes + type guards (`isChatInputCommand`, `isButton`,
  `isStringSelectMenu`, `isModalSubmit`); `.deferReply()`, `.editReply()`,
  `.followUp()`, `.update()`, `.showModal()`, `flags: MessageFlags.Ephemeral`.
- `InteractionCollector` / `message.createMessageComponentCollector()` for
  short-lived, message-scoped pickers (alternative to global `custom_id`
  routing).
- Deprecations to prefer: `setContexts` over `setDMPermission`;
  `flags: MessageFlags.Ephemeral` over `ephemeral: true`; `ready` → `clientReady`.
- For the HTTP-webhook model, `@discordjs/core` + `@discordjs/rest` +
  `discord-interactions` (`verifyKey`) is the more common stack.

## Design-relevant trade-offs (summary)

1. **Slash commands** remove parsing, add discovery/validation/permissions, and
   drop the MessageContent privileged intent. Cost: registration step + rigid
   schema (bridge `!assistant` with one STRING option + defer).
2. **Components + deferred/ephemeral** replace the fragile numeric media picker.
3. **HTTP interactions endpoint** can retire the single-gateway distributed lock
   (fits multi-replica) but loses gateway events and needs Ed25519 verification.
4. **Embeds** are right for Wrapped/stats (mind 25-field / 6000-char caps).
5. **Channel webhooks** cheapest for one-way announcements.

### Continuation
Discord-API research agent kept alive: `a35eb5fe25190eaff`.
