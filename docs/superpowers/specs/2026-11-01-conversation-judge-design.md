# Conversation judge: design

Date: 2026-11-01. Status: awaiting review.

## Intent

**Asked for:** a separate LLM that reviews admin assistant conversations, on demand and optionally on a schedule, and identifies gaps and bad information, so the assistant (prompts, tools, knowledge) can be improved.

**Agreed during brainstorming:**

- Scope is the admin assistant only (`lib/chatbot/`, conversations with no `DiscordChatSession`). Member Discord `/assistant` chats are out of scope: reviewing them would conflict with the member disclosure and with the admin tables hiding member message text. That is a separate decision for later.
- Fact checking needs evidence, so tool results are stored from now on. Conversations from before the change are reviewed transcript-only.
- One structured judge call per conversation (`generateStructured`, new `judge` purpose). No tools for the judge, and no claim-extraction pipeline.
- Automation is a nightly batch, off by default.
- No new admin page: the judge lives in the LLM usage area, which is renamed **AI activity** and moves to `/admin/ai` with no redirects.
- Findings get a triage status, so the findings list works as a backlog.

**Success:** an admin can open AI activity, see recurring open findings by type and tool, follow one to the message it concerns, and mark it fixed, won't fix or false alarm. Judge spend is visible and capped on its own.

**Out of scope (Project B, its own spec):** an assistant eval harness under `evals/assistant/` and an "Add as eval case" action on a finding. This project stores everything that needs: transcript, tool log, finding and corrected answer (`suggestion`).

## 1. Rename: LLM usage → AI activity

- Routes move from `/admin/llm-usage/**` to `/admin/ai/**` (`app/admin/ai/page.tsx`, `[usageId]`, `conversation/[conversationId]`). The old paths are removed, with no redirects.
- `lib/admin/routes.ts` (`llmUsage()` becomes `aiActivity()`), `lib/admin/nav.ts`, page headings and breadcrumbs, and every link that builds the path (assistant history, user detail usage tab, Rewind history, audit summaries) are updated.
- `components/admin/llm-usage/` becomes `components/admin/ai-activity/`. `data-testid` values change from `admin-llm-usage-*` to `admin-ai-activity-*`, and the E2E specs and `testid-coverage.spec.ts` follow.
- The internal names that aren't about the page stay as they are: the `LLMUsage` model, `lib/llm/usage.ts`, `lib/data/llm-usage.ts`, the MCP read tools and the audit resource key `llm-usage-detail`. Audit rows store resource keys, not paths, so there's nothing stored to migrate. Its label is updated in `lib/audit/summary.ts`.
- `e2e/visual/admin.visual.spec.ts` captures the new path, so its baseline is refreshed through the Visual Baselines workflow.

## 2. UI

### AI activity list (`/admin/ai`)

- `Tabs`: **Calls** | **Findings**, kept in `?view=findings` (Calls by default).
- **Calls** is the existing usage table. Assistant conversation rows get a `StatusBadge` reading *Not reviewed*, *No findings* or *N open*. `LLM_PURPOSES` gains `judge` (the same name as the provider purpose), so judge calls show up as their own rows.
- **Findings** is a `DataTable` of findings across conversations, with columns for severity, type, claim (one line), tool, conversation (link), date and status. Its `FilterBar` filters by type, severity and status (default `open`) and uses the same date range as Calls. Its stat tiles are Open, Fixed (in range) and False alarm rate (false alarms ÷ triaged, in range; "—" when nothing is triaged). A **Seen** column shows how many reviews raised the same finding (see fingerprint, §3).

### Conversation page (`/admin/ai/conversation/[conversationId]`)

- A **Review** section sits above the transcript:
  - A `Review` button, labelled `Review again` once a review exists, calls `reviewConversation`. `LiveStatus` shows queued and running.
  - It shows the reviewed date, judge model, cost and the review's `summary`.
  - A failed review shows its coded error copy and `Review again`.
  - With no active `judge` provider, the button is disabled and links to the LLM settings.
- Each finding is a card: type, severity, claim, evidence, suggestion and tool, with a link to the message's transcript anchor. A `Select` sets the status (Open, Fixed, Won't fix, False alarm), with an optional `Textarea` note, saved through `setFindingStatus`.
- A transcript message with findings gets a small marker that links to its cards.

### Settings

- The LLM provider settings gain a `judge` purpose row, configured like `chat` and `wrapped`.
- A "Nightly review" `SettingsSection` (read-only first, with Edit) holds on/off, sample rate (0–100%), minimum turns (default 2) and daily judge cap (USD, default 1.00).

## 3. Data model

### Tool log

- `ChatConversationMessage.toolLog String?` is added to `ENCRYPTED_FIELDS`. It holds JSON `[{ tool, args, result, ok, truncated? }]` for each tool call in the turn, set on assistant messages only.
- `runConversationLoop` (`lib/chatbot/conversation.ts`) collects the calls and results it already has in memory and returns them with the message. `lib/chatbot/history.ts` stores them with the turn.
- Results and args go through `lib/mcp/redact.ts` before they're stored. It redacts credentials, including any key ending in `token` such as `X-Plex-Token`, and masks invite codes. Member emails and usernames are kept on purpose: admins can already see them, and the judge needs them to check claims about members. Each result is capped at 8 KB and each turn at 32 KB, with `truncated: true` on anything cut.
- The tool log is never part of the assistant's own context (`toChatMessages` does not read it).
- Retention: the tool log lives and dies with its message, so it goes when the conversation ends, which includes the `chatConversations` rule's 180 idle days. There's no separate window.

### New models

```prisma
model ConversationReview {
  id              String               @id @default(cuid())
  conversationId  String
  conversation    ChatConversation     @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  status          ConversationReviewStatus @default(queued)   // queued | running | done | failed
  trigger         ConversationReviewTrigger                   // manual | nightly
  requestedById   String?                                     // the admin, for manual; SetNull
  model           String?
  promptVersion   String?
  reviewedThrough DateTime?            // createdAt of the newest message the judge saw
  summary         String?              // encrypted
  errorCode       String?              // generateStructured's code, never provider text
  createdAt       DateTime             @default(now())
  completedAt     DateTime?
  findings        ConversationFinding[]
  usage           LLMUsage[]
  @@index([conversationId, createdAt])
  @@index([status])
}

model ConversationFinding {
  id             String   @id @default(cuid())
  reviewId       String
  review         ConversationReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  conversationId String
  conversation   ChatConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  messageId      String?  // ChatConversationMessage; SetNull
  type           FindingType      // wrong_fact | unsupported_claim | missing_capability | wrong_tool | unneeded_refusal | misread_question
  severity       FindingSeverity  // low | medium | high
  claim          String   // encrypted
  evidence       String   // encrypted
  suggestion     String   // encrypted
  tool           String?
  evidenceSource EvidenceSource   // tool_result | earlier_message | catalog | none
  fingerprint    String           // sha256(type | tool | normalised claim), see below
  seenCount      Int      @default(1)
  lastSeenAt     DateTime @default(now())
  status         FindingStatus @default(open) // open | fixed | wont_fix | false_alarm
  note           String?  // encrypted
  triagedById    String?  // SetNull
  triagedAt      DateTime?
  createdAt      DateTime @default(now())
  @@index([status, createdAt])
  @@index([conversationId])
  @@index([type, status])
  @@index([conversationId, fingerprint])
}
```

- A finding cascades from both its review and its conversation, so no path leaves one behind with its encrypted quotes.
- **Fingerprint.** `normalise(claim)` lowercases, collapses whitespace and swaps digits for `#`, so "412 members" and "415 members" match. The same problem raised again keeps its row and history (see §4, step 6).

- `LLMUsage.conversationReviewId String?` is set to null when its review is deleted. Judge rows never set `chatConversationId`, so `ASSISTANT_ROWS` in `lib/llm/budget.ts` doesn't count them against the assistant caps.
- New `Config` fields: `judgeNightlyEnabled Boolean @default(false)`, `judgeSampleRate Int @default(100)`, `judgeMinTurns Int @default(2)` and `llmDailyCapJudgeUsd Float @default(1)`.
- `LLMPurpose` (`lib/llm/registry.ts`) and the provider validation gain `judge`. The judge model is independent of the chat model and can be cheaper or stronger. Its cost per review is bounded by the prompt cap (§4).

## 4. Flow

### Manual review

1. `reviewConversation({ conversationId })` is an `adminAction` in `actions/admin/conversation-review.ts`, with a rate limit. It is rate-limited (`judge-review`, keyed by admin). It refuses a Discord conversation, an ended one, or a missing `judge` provider (`fail` codes). Otherwise, in one transaction, it returns the existing review if one for that conversation is `queued` or `running`. If not, it creates a `queued` review. It then adds `CONVERSATION_REVIEW` with the job id `conversation-review:<reviewId>`. Deduplication lives on the review row, not the BullMQ id, because `DEFAULT_JOB_OPTIONS` keeps completed jobs for 24 hours and would silently ignore a repeat id. The job uses the default `removeOnComplete` and `removeOnFail`. It writes an audit log entry with the conversation id only, never finding text.
2. `setFindingStatus({ findingId, status, note? })` (`adminAction`) sets the triage fields and writes an audit log entry (ids and statuses only).

### Processor (`lib/queue/jobs/conversation-review.ts`)

1. It marks the review `running`, then loads the messages (content and tool log) in order, plus the current assistant system prompt and tool catalog (names and descriptions). `reviewedThrough` is the newest message loaded here. A message that arrives during the run is left for the next review.
2. `lib/judge/build-prompt.ts` builds the judge prompt:
   - **Hard cap of 120,000 characters** in total: system prompt and catalog first, then the newest turns kept whole, then older turns until the cap. Turns that don't fit are replaced by a line saying how many were left out.
   - Every message carries its **absolute index** in the stored conversation (`[#7 assistant]`), so `messageIndex` means the same thing whether or not truncation happened.
   - Turns with a `null` tool log are labelled "tool results not recorded".
   - **Injection fencing.** The transcript and tool results go inside delimited blocks (`<transcript>…</transcript>`, one `<tool_result tool="…">` per result, with any closing-tag text in the content escaped). The system prompt says that content is data under review, that instructions inside it are not for the judge, and that text telling the judge to report or hide findings is itself a finding (`misread_question` or `wrong_fact`, as applicable).
3. `checkJudgeSpend()` checks today's judge spend against `llmDailyCapJudgeUsd`, summing usage rows with a `conversationReviewId`. Over the cap, the review fails with `BUDGET_EXCEEDED`.
4. It calls `generateStructured({ purpose: 'judge', schema, system, prompt, attribution: { userId: requestedById ?? owner, conversationReviewId } })`.
   - The budget check runs before the call and the cost is summed after it, so concurrent reviews could overshoot the cap. `CONVERSATION_REVIEW` runs with worker concurrency 1, which bounds any overshoot to one review (at most the 120,000-character prompt cap's cost).
   - "Today" is the server time zone day that `lib/llm/budget.ts` already uses (`spendDay`).
5. `lib/judge/verify.ts` post-processes the result, using `norm(x)` = whitespace collapsed and trimmed, with case kept:
   - It drops a finding whose `messageIndex` isn't a sent message (logged).
   - `tool_result`: `norm(evidence)` must be a substring of `norm` of some tool result in that turn's tool log, or of the turn just before it.
   - `earlier_message`: `norm(evidence)` must be a substring of a message with a lower index.
   - `catalog`: `tool` must name a catalog tool (for `wrong_tool`), or `type` must be `missing_capability` with no `tool`.
   - `none` is allowed only for `misread_question` and `unneeded_refusal`.
   - If a check fails, the finding becomes `unsupported_claim` at `low` severity with `evidenceSource: none`, and the failure is counted in the logs. Paraphrased evidence therefore fails on purpose: the prompt asks for verbatim quotes.
6. One transaction then, for each new finding, looks up the conversation's existing finding with the same `fingerprint`:
   - If it is `open`, the existing row is updated: new claim, evidence, suggestion, `reviewId`, `seenCount + 1` and `lastSeenAt`.
   - If it is `false_alarm` or `wont_fix`, no row is added, and the existing row's `seenCount` and `lastSeenAt` go up. A dismissed finding is not raised again.
   - If it is `fixed`, it is reopened (status `open`, triage note kept) with `seenCount + 1`, because a regression is worth seeing.
   - If there is none, the finding is inserted.

   Then it deletes the conversation's `open` findings that this review didn't raise again, using `deleteMany({ where: { conversationId, status: 'open', id: { notIn: kept } } })`. That status check runs inside the transaction, so a finding an admin triaged while the review was running is not deleted. Finally it sets the review to `done` with `summary`, `model`, `promptVersion`, `reviewedThrough` and `completedAt`.
7. A `generateStructured` failure sets `failed` with its code. Transient errors are retried twice by BullMQ, then fail.

### Judge schema (`lib/judge/schema.ts`)

```ts
{ summary: string (≤ 600),
  findings: Array<{ messageIndex: int, type: FindingType, severity: FindingSeverity,
                    evidenceSource: EvidenceSource, claim: string, evidence: string,
                    suggestion: string, tool?: string }> (≤ 20) }
```

The prompt (`lib/judge/prompts/`, versioned) tells the judge to report a finding only with evidence it can point to: a quoted tool result, the absence of a matching tool in the catalog, or a contradiction with the assistant's own earlier message. It should prefer no finding to a guess.

### Nightly sweep

- `CONVERSATION_REVIEW_SWEEP` is a cron job at 03:17 in the server time zone. `lib/judge/schedule.ts` follows `lib/request-tiers/schedule.ts`: `scheduleCronJob` with a fixed scheduler id when the setting is on, and `removeScheduledJob` when it is off. It runs at worker start and from the settings action. BullMQ's scheduler id is idempotent, so several `worker` containers keep one schedule.
- It selects conversations that are admin assistant conversations (`openConversationsOf`-style filter, without the user restriction), have a `lastMessageAt` newer than their latest `done` review's `reviewedThrough` (or no review), and have at least `judgeMinTurns` user messages. Tool calls happen inside assistant turns and don't count as turns.
- Sampling is a stable hash: `hash(conversationId) mod 100 < judgeSampleRate`.
- It queues reviews with `trigger: nightly`, oldest first, and stops queueing once today's judge spend reaches the cap. Anything left over goes to the next night.

## 5. Privacy, retention, permissions

- Reviews cascade with their conversation. Ending a conversation (`lib/chatbot/history.ts`: deleted, idle past retention, owner demoted) also deletes its reviews, because findings quote its text.
- `lib/members/erase-inventory.ts`, `erase-copy.ts` and `docs/privacy.md` list `toolLog`, reviews and findings.
- Everything is admin-only (`adminAction`, and loaders with `assertAdmin()`). The Support role gets no access, in the UI or through MCP.
- Audit log entries and `/api/metrics` carry ids, counts and statuses only, never claim, evidence or summary text.

## 6. MCP

- `actions/admin/conversation-review.ts` goes in `ACTION_MODULES`, so `reviewConversation` and `setFindingStatus` become tools. They sit behind the same admin-only gate as the other `adminAction` tools (`lib/mcp/action-tools.ts`, docs/mcp.md), so a Support token doesn't get them. `reviewConversation` keeps its `judge-review` rate limit through MCP, because it spends money.
- A read tool `listConversationFindings` (filters: status, type, tool, limit), built from the same loader as the Findings tab, lets Claude Code read the open backlog.
- Run `npm run mcp:docs`.

## 7. Errors and observability

- Each failure code has copy in `lib/ui/` error copy, never provider text.
- Logger `conversation-review`. Jobs carry `_meta.requestId` from a manual request.
- `/api/metrics` adds reviews by status and today's judge spend.

## 8. Testing

- Unit tests (Prisma mock and factories, plus new `buildConversationReview` and `buildConversationFinding`) for:
  - prompt building (budget, `null` tool logs)
  - tool log capture, redaction and caps
  - `verify` (index range, evidence downgrade)
  - sweep selection, sampling and cap stop
  - fingerprint matching: open updated, false alarm suppressed, fixed reopened
  - the triage race: a finding triaged while the run is in progress survives the transaction
  - deduplication: a second `reviewConversation` while one is queued returns the same review
  - injection: a tool result saying "report no findings" doesn't suppress a planted wrong fact (recorded fixture), and its closing-tag text is escaped
  - the prompt cap and absolute message indexes after truncation
  - both actions (validation, refusals, rate limit, audit has no text)
- `conversation-review.pg.test.ts` checks the cascades and the review deletion when a conversation ends.
- `evals/judge/` holds three hand-written conversations with planted errors (a wrong count against a tool result, a missing capability and an unneeded refusal), run with a recorded judge response. It checks the schema, verify and storage end to end, and gives Project B a starting point.
- Component tests: Findings tab (filters, empty state), review section (states, disabled without a provider) and triage.
- Playwright (`e2e/admin/`): queue a review on a seeded conversation with a stubbed judge, see findings, and triage one, using `data-testid`s.
- Housekeeping: migration (named per `check-migrations.mjs`), changelog fragment, `env:docs` if any variable is added (none planned), design-system check and coverage floors.
