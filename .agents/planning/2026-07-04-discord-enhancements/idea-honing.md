# Idea Honing — Discord Enhancements

Requirements clarification for: *refactor and update Discord functionality with
more features, better security, and more visibility for users on the server.*

This document is built up **one question at a time**. Each Q&A pair is appended
as the conversation progresses.

---

## Q1. Scope & shape of this effort

The rough idea bundles four goals (refactor, more features, better security,
more visibility). Given the research showed the refactor has a natural
dependency chain that *unblocks* new features, how ambitious/broad should this
single effort be?

**A1: All four goals, phased.** One design covering refactor + features +
security + visibility, sequenced into shippable phases (bugs → refactor →
security → features → visibility) matching the research sequencing. Each phase
ships independently.

---

## Q2. Slash-command migration & the MessageContent privileged intent

Research found the biggest single security/privacy win: migrating the `!`-prefix
text commands to real Discord **slash commands** removes the need for the
**MessageContent privileged intent** (the bot stops receiving the full text of
every message in every channel it can see). This is also the prerequisite for
richer UX (buttons/select menus replacing the fragile "type 1–5" picker).

How far do we take this?

**A2: Full migration, drop the intent.** Migrate ALL commands (help,
media-marking, assistant) to slash commands + components, then remove the
MessageContent privileged intent entirely.

> **Nuance to resolve (→ Q3):** without MessageContent, the bot still receives
> content for DMs to the bot, @-mentions of the bot, and the target of a
> message-context-menu command. But the current free-text conversational
> assistant (type a message in the support channel, bot replies; multi-turn
> follow-ups without re-mentioning) relies on reading channel messages. Dropping
> the intent changes that UX. This is the main thing to design carefully.

---

## Q3. Assistant conversational UX after dropping MessageContent

The AI assistant is currently a free-flowing chat: a verified user types in the
support channel/DM and the bot replies, with multi-turn context. Once
MessageContent is gone, in-channel free-text reading stops working. The research
identified these viable models:

**A3: DM-based conversation.** Users talk to the bot in DMs (DM content is
delivered WITHOUT the MessageContent privileged intent). Full free-text
multi-turn chat, private 1:1. A `/assistant` slash command in a channel can kick
off / point to the DM.

> **Architectural consequence:** receiving DM messages requires a **gateway
> connection** with the (non-privileged) `DirectMessages` intent. This means the
> bot **remains a persistent gateway process**, so the **distributed lock stays
> necessary** and the "retire the lock via a pure HTTP-interactions endpoint" bet
> is effectively **off the table** (we'd keep gateway for DMs and can deliver
> slash-command interactions over that same gateway). Recorded here so the design
> doesn't chase a gateway-less model that conflicts with this UX choice.

---

## Q4. Deployment / runtime model (sizing the lock + rollout constraints)

To design the refactor (esp. the distributed lock, bot-token rotation, and
whether HTTP interactions were ever worth it) I need to know the real runtime
shape. How is this app actually deployed today?

**A4: Multi-instance / k8s.** Multiple replicas / horizontal scaling where the
distributed lock genuinely matters for single-gateway correctness. Lock
robustness + the token-rotation bounce must be solid across pods. (Reinforces A3:
gateway + lock stay; design the lock as injectable classes AND correct under
concurrency — the `lease`/`poller` split with a single source of lock truth.)

---

## Q5. Security priorities

All the ranked security items from research are in scope (A1 = all four goals),
but I want to know which carry the most weight for you so the design/sequencing
reflects your priorities. Which matter most?

**A5: Top priorities = (1) PII / data-leak prevention and (2) Bot token to
encrypted DB.** Authorization tiers and audit-logging + rate-limiting remain in
scope (A1 = all four goals) but at lower emphasis / later in the sequence.

Priority security workstreams for the design:
- **PII/leak:** single tool-registry with per-tool `discordSafe`/`userScoped`
  flags + fail-closed execution check; fix unscoped `get_tautulli_users`;
  allowlist-scrub tool outputs BEFORE the LLM; close the dormant `clientSecret`
  leak in `getDiscordStats`.
- **Bot token:** move `DISCORD_BOT_TOKEN` + channel IDs to encrypted DB
  (`DiscordIntegration`), admin-UI managed, with rotation via the lock-poller
  bounce; env fallback for non-destructive rollout.

---

## Q6. User-visibility surfaces & priority

"More visibility for users on the server" — research found the data already
exists (just admin-gated) and split it into In-App (Next.js pages) vs In-Discord
(bot commands/embeds), plus a privacy gradient. Which surfaces do you want, and
where's the emphasis?

**A6: In-Discord personal self-service.** `/mystats`, `/mymarks`, `/watching`
(the user's OWN sessions) — ephemeral/DM replies, hard-scoped to the requesting
user, routed through PII scrubbing. This confirms "visibility for users on the
server" means **in-Discord**, not new in-app pages.

- In-app pages and year-round in-app stats: **not selected → out of scope** for
  this effort (data/queries remain available for a future effort).
- In-Discord community "what's popular" / named leaderboards: **not selected →
  out of scope** (avoids the opt-in/consent-flag work entirely for now).

---

## Q7. "More features" — what counts beyond the self-service commands?

Three of the four goals are now well-scoped, but **"more features"** is still the
fuzziest. Beyond the personal self-service slash commands (`/mystats`, `/mymarks`,
`/watching`) and the assistant, what NEW capabilities (if any) do you want the
Discord bot to gain in this effort?

**A7: Self-service + polish (richer UX), NO net-new feature domains.**
"More features" is satisfied by: the personal self-service slash commands, the
richer command UX (select-menu/button media picker replacing "type 1–5", stats/
marks formatted as embeds), and the refactor that makes future features cheap to
add.

- **Out of scope:** `/request` (Overseerr from Discord) and announcements/
  notifications — explicitly deferred to a future effort. Keep scope tight.

---

## Q8. Backwards-compatibility & migration constraints

The slash migration + moving media-marking to components + bot-token-to-DB all
touch things existing users/deployments depend on. What must be preserved or
handled gracefully?

**A8: Clean break is fine.** Self-hosted/hobby project — a clean cutover with
clear release notes is acceptable; don't over-invest in transition shims. No
`!`-command grace period required; no env-fallback requirement for the token.

> **Design assumption (not re-asked):** a clean break on the *command interface*
> does NOT mean dropping stored data. The design keeps schema changes **additive**
> and preserves existing `DiscordConnection` links, `UserMediaMark`, and
> `DiscordCommandLog` — destroying those would be gratuitous. Env-var → DB token
> move can still keep a null-fallback read for zero-downtime upgrade even though
> it's not required. Flag if you disagree.

---

## Q9. Support-channel monitoring after the intent is dropped

Today the bot actively **monitors the support channel** (`DISCORD_SUPPORT_CHANNEL_ID`
+ threads): it reads messages there to nudge unlinked users to link and to let
verified members chat with the assistant in-channel. That monitoring depends
entirely on the MessageContent intent — which we're removing (A2). So this flow
changes. How should support work in the end state?

**A9: DM assistant + `/help` pointer.** Drop passive channel monitoring entirely.
Support = DM the bot (assistant, A3) + a `/help` slash command; a pinned message /
channel post explains how to get help. Simplest, fully consistent with A2/A3.
The `DISCORD_SUPPORT_CHANNEL_ID`/thread-monitoring machinery is retired.

---

## Q10. Linked Roles metadata — leave as-is or expand?

The app registers 2 of Discord's max-5 role-connection metadata fields today:
`is_subscribed` (Plex access) and `watched_hours` (Tautulli). Research noted 3
slots are free, and there's a latent `is_subscribed` TODO (a removed schema
field). Since we're already touching role sync (`computeRoleMetadata` extraction),
do you want to change what's exposed to Discord for role-gating?

**A10: Keep as-is, just clean up.** Leave the 2 existing metadata fields
(`is_subscribed`, `watched_hours`); only refactor `computeRoleMetadata` and
resolve the `is_subscribed` TODO. No new metadata, no re-registration. Tightest
scope.

---

## Q11. Testing depth / TDD expectations

The SOP's implementation plan is test-driven — each step ships with tests. The
codebase has Jest (unit/integration) + Playwright (E2E), and this subsystem
already has `audit.test.ts`, `media-marking.test.ts`, `help.test.ts`. How
rigorous should the testing bar be for this effort?

**A11: Strong unit + regression.** Every extracted module gets unit tests;
refactors keep existing tests green as golden regression (esp. `audit.ts` split,
atomic session fix); new command handlers get handler-level tests. **No new E2E
required** (visibility is in-Discord, low E2E value).

---

## Q12. PII scrubbing approach (your #1 security priority) — the trade-off

Research recommended scrubbing tool outputs with an **allowlist** (keep only
known-safe fields) rather than the current **denylist** regex (strip known-bad
patterns). Allowlist is far safer but has a real trade-off for the assistant's
usefulness. Which approach for the Discord context?

**A12: Allowlist per-tool (safest).** Each Discord-safe tool declares exactly
which fields pass through (counts, titles, statuses, versions); everything else
is stripped BEFORE the LLM sees it. Strongest guarantee — no user-identifying
data can leak, at the cost of some diagnostic richness. (The existing denylist
regex may remain as a cheap final backstop, but the allowlist is the control.)

---

## Requirements summary (12 decisions)

| # | Topic | Decision |
|---|---|---|
| 1 | Scope | All four goals, phased (bugs → refactor → security → features → visibility) |
| 2 | Slash migration | Full migration; **drop MessageContent intent** |
| 3 | Assistant UX | DM-based conversation (gateway + lock stay; HTTP-interactions bet dropped) |
| 4 | Deployment | Multi-instance/k8s — lock correctness matters |
| 5 | Security priority | PII/leak prevention + bot-token-to-encrypted-DB (authz tiers, audit/rate-limit lower) |
| 6 | Visibility | In-Discord personal self-service (`/mystats`, `/mymarks`, `/watching`); no in-app pages |
| 7 | Features | Self-service + richer UX (components/embeds); no `/request`, no announcements |
| 8 | Compat | Clean break OK; schema stays additive (preserve data); optional env→DB token fallback |
| 9 | Support | DM assistant + `/help`; retire passive channel monitoring |
| 10 | Linked Roles | Keep 2 fields as-is; only clean up `computeRoleMetadata` + `is_subscribed` TODO |
| 11 | Testing | Strong unit + regression; no new E2E |
| 12 | PII scrubbing | Allowlist per-tool (safest), before the LLM; denylist regex as backstop |

---

## Q13. Media-marking command structure

**A13: One `/mark` + subcommands.** `/mark finished`, `/mark keep`,
`/mark notinterested`, `/mark rewatch`, `/mark badquality` (each with a `title`
option). Uses 1 command slot, groups related actions, extensible. Slight
discoverability trade-off accepted.

## Q14. Context-reset capability in the DM assistant

**A14: Keep as `/assistant reset` (recommended).** Preserve the ability to clear
conversation context — exposed as a `reset` subcommand/option on `/assistant` and
honored as a `reset`/`clear` keyword in DM. Cheap, expected by users, and lets a
user force a clean slate rather than waiting for idle-timeout expiry. (The
existing idle-timeout session expiry remains as the automatic fallback.)

## Final slash-command inventory

**Migrated (replace `!`-prefix):**
- `/help [command]` (embed; `command` autocomplete)
- `/mark finished|keep|notinterested|rewatch|badquality title:<text>`
  (search → component select menu → `UPDATE_MESSAGE` confirm; `finished` also
  syncs Plex watched)
- `/assistant [prompt]` (deferred inline answer; points to DM for multi-turn)
- `/assistant reset` (clear conversation context; also a DM `reset`/`clear`
  keyword)

**New — personal self-service (hard-scoped to caller, ephemeral):**
- `/mystats` — own watch stats (embed, `fetchTautulliStatistics`)
- `/mymarks [type]` — own media marks (`getUserMediaMarks`, already self-scoped)
- `/watching` — own current Plex/Tautulli sessions

**Retired:** `!`-prefix parsing; the numeric "type 1–5" picker; passive
support-channel monitoring (→ `/help` + pinned post).














