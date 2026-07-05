# Summary — Discord Enhancements (PDD)

Prompt-Driven Development output for: _"refactor and update Discord functionality
with more features, better security, and more visibility for users on the server."_

Generated 2026-07-04.

## Artifacts created

```
.agents/planning/2026-07-04-discord-enhancements/
├── rough-idea.md                    the original idea (parameter reconciliation noted)
├── idea-honing.md                   14 requirements Q&A + a 12-decision summary + command inventory
├── research/
│   ├── current-state.md             full map of the existing Discord subsystem (~6.2k LOC)
│   ├── discord-api-capabilities.md  slash/components/embeds/intents/webhooks (official docs)
│   ├── security-hardening.md        ranked, codebase-fitting security options
│   ├── user-visibility.md           reusable per-user data + privacy gradient
│   └── refactor-architecture.md     per-file decomposition + shippable sequencing
├── design/
│   └── detailed-design.md           standalone design: 19 FR + 9 NFR, 3 mermaid diagrams
├── implementation/
│   └── plan.md                      24 test-driven, demoable steps in 5 phases + checklist
└── summary.md                       this document
```

## Design in brief

**The unifying move:** migrate `!`-prefix text commands to native **slash commands
+ message components**, which lets us **remove the `MessageContent` privileged
intent** (the biggest privacy win) and gives a clean command-registry
architecture. The AI assistant moves to **DM-based conversation** (DM content is
exempt from the intent), so the bot stays a gateway process and the **distributed
lock is retained and hardened** (multi-instance/k8s).

**Final slash-command inventory:**
- `/help [command]`, `/mark <finished|keep|notinterested|rewatch|badquality>
  title:`, `/assistant [prompt]`, `/assistant reset` (migrated)
- `/mystats`, `/mymarks [type]`, `/watching` (new, self-scoped, ephemeral)

**Security keystone:** a single chatbot **tool registry** with per-tool
`discordSafe`/`userScoped`/`discordFields` flags → **allowlist-scrub outputs
before the LLM** + **fail-closed execution**. Plus **bot token → encrypted DB**
with **rotation via the lock-poller bounce**, and the dormant `clientSecret` leak
closed.

**Visibility:** delivered **in Discord** as personal self-service commands, using
data that already exists (just admin-gated today).

## Implementation approach

24 steps, **each shipping with tests and a working demo**, grouped into five
independently-releasable phases:
0. **Bug fixes** (misrouted `library_stats`, unscoped `get_tautulli_users`)
1. **Refactor foundation** (shared loaders, tool registry, audit split, atomic
   chat-session, role-metadata extract, lock classes)
2. **Slash + component migration** → drops `MessageContent`
3. **Security** (allowlist scrub, fail-closed, token-in-DB + rotation, audit +
   rate-limit + authz tiers)
4. **In-Discord visibility** (`/mymarks`, `/mystats`, `/watching`)
+ Wrap-up (docs, release notes, regression).

Ordering is dependency-driven: the **tool registry** (Phase 1) precedes new tools;
the **command registry** (Phase 2) precedes the self-service commands (Phase 4).

## Scope decisions (what's in / out)

**In:** all four goals, phased; full slash migration + intent removal; DM
assistant; PII allowlist scrubbing; bot-token-to-DB + rotation; `/mystats`,
`/mymarks`, `/watching`; richer component/embed UX; strong unit + regression tests.

**Out (deferred to a future effort):** in-app (Next.js) user pages & year-round
in-app stats; in-Discord community/leaderboard features; `/request` (Overseerr
from Discord); announcements/notifications; expanding Linked Roles metadata;
gateway-less HTTP-interactions model.

## Suggested next steps

1. Review `design/detailed-design.md` and `implementation/plan.md`.
2. Begin **Phase 0** (Steps 1–2) — zero-risk bug fixes that can ship immediately
   and validate the workflow.
3. Then **Phase 1** to lay the refactor foundation (the tool + command registries
   unlock everything after).
4. Consider a spike on the **Discord app setup** (a dedicated dev guild for
   instant slash-command registration) before Phase 2.
5. Track progress via the checklist at the top of `plan.md`.

## Areas that may need further refinement

- **`/mystats` cost/latency:** `fetchTautulliStatistics` does a full-history fetch;
  the step defers the interaction, but consider caching if usage is heavy.
- **Env→DB token fallback rollout:** verify the `configVersion` bounce behaves in
  a real multi-pod deploy (the one genuinely concurrency-sensitive piece).
- **Authz tiers (FR-14):** "admin" = app admin; if a middle "mod" tier is wanted,
  that needs Discord-role gating (a GuildMembers intent + a configured role ID) —
  intentionally left lower-priority.
- **`discordFields` allowlists:** each Discord-safe tool needs its safe-field list
  curated; a slightly conservative first pass is recommended, widened as needed.
