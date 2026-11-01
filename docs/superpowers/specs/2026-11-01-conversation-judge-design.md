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
- The internal names that aren't about the page stay as they are: the `LLMUsage` model, `lib/llm/usage.ts`, `lib/data/llm-usage.ts` and the MCP read tools.

## 2. UI

### AI activity list (`/admin/ai`)

- `Tabs`: **Calls** | **Findings**, kept in `?view=findings` (Calls by default).
- **Calls** is the existing usage table. Assistant conversation rows get a `StatusBadge` reading *Not reviewed*, *No findings* or *N open*. `LLM_PURPOSES` gains `review`, so judge calls show up as their own rows.
- **Findings** is a `DataTable` of findings across conversations, with columns for severity, type, claim (one line), tool, conversation (link), date and status. Its `FilterBar` filters by type, severity and status (default `open`) and uses the same date range as Calls. Its stat tiles are Open, Fixed (in range) and False alarm rate (false alarms ÷ triaged, in range).

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
- Results and args go through the credential and invite-code redaction the MCP path uses before they're stored. Each result is capped at 8 KB and each turn at 32 KB, with `truncated: true` on anything cut.
- The tool log is never part of the assistant's own context (`toChatMessages` does not read it).

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
  conversationId String   // denormalised for the Findings list
  messageId      String?  // ChatConversationMessage; SetNull
  type           FindingType      // wrong_fact | unsupported_claim | missing_capability | wrong_tool | unneeded_refusal | misread_question
  severity       FindingSeverity  // low | medium | high
  claim          String   // encrypted
  evidence       String   // encrypted
  suggestion     String   // encrypted
  tool           String?
  status         FindingStatus @default(open) // open | fixed | wont_fix | false_alarm
  note           String?  // encrypted
  triagedById    String?  // SetNull
  triagedAt      DateTime?
  createdAt      DateTime @default(now())
  @@index([status, createdAt])
  @@index([conversationId])
  @@index([type, status])
}
```

- `LLMUsage.conversationReviewId String?` is set to null when its review is deleted. Judge rows never set `chatConversationId`, so `ASSISTANT_ROWS` in `lib/llm/budget.ts` doesn't count them against the assistant caps.
- New `Config` fields: `judgeNightlyEnabled Boolean @default(false)`, `judgeSampleRate Int @default(100)`, `judgeMinTurns Int @default(2)` and `llmDailyCapJudgeUsd Float @default(1)`.
- `LLMPurpose` (`lib/llm/registry.ts`) and the provider validation gain `judge`.

## 4. Flow

### Manual review

1. `reviewConversation({ conversationId })` is an `adminAction` in `actions/admin/conversation-review.ts`, with a rate limit. It refuses a Discord conversation, an ended one, or a missing `judge` provider (`fail` codes). Otherwise it creates a `queued` review and adds `CONVERSATION_REVIEW` with the job id `conversation-review:<conversationId>`, so a second click while one is queued does nothing. It writes an audit log entry.
2. `setFindingStatus({ findingId, status, note? })` (`adminAction`) sets the triage fields and writes an audit log entry.

### Processor (`lib/queue/jobs/conversation-review.ts`)

1. It marks the review `running`, then loads the messages (content and tool log) in order, plus the current assistant system prompt and tool catalog (names and descriptions).
2. `lib/judge/build-prompt.ts` builds the judge prompt with a character budget: the newest turns are kept whole, and older turns beyond the budget are replaced by a count. Turns with a `null` tool log are labelled "tool results not recorded".
3. `checkJudgeSpend()` checks today's judge spend against `llmDailyCapJudgeUsd`, summing usage rows with a `conversationReviewId`. Over the cap, the review fails with `BUDGET_EXCEEDED`.
4. It calls `generateStructured({ purpose: 'judge', schema, system, prompt, attribution: { userId: requestedById ?? owner, conversationReviewId } })`.
5. `lib/judge/verify.ts` post-processes the result:
   - It drops a finding whose `messageIndex` is out of range (logged).
   - Where `evidence` claims to quote a tool result that isn't in that turn's tool log, it changes the type to `unsupported_claim` and the severity to `low`.
6. One transaction then:
   - deletes the conversation's earlier `open` findings (triaged findings stay, on their earlier review)
   - inserts the new findings
   - sets the review to `done` with `summary`, `model`, `promptVersion`, `reviewedThrough` and `completedAt`
7. A `generateStructured` failure sets `failed` with its code. Transient errors are retried twice by BullMQ, then fail.

### Judge schema (`lib/judge/schema.ts`)

```ts
{ summary: string (≤ 600),
  findings: Array<{ messageIndex: int, type: FindingType, severity: FindingSeverity,
                    claim: string, evidence: string, suggestion: string, tool?: string }> (≤ 20) }
```

The prompt (`lib/judge/prompts/`, versioned) tells the judge to report a finding only with evidence it can point to: a quoted tool result, the absence of a matching tool in the catalog, or a contradiction with the assistant's own earlier message. It should prefer no finding to a guess.

### Nightly sweep

- `CONVERSATION_REVIEW_SWEEP` is a cron job (`scheduleCron`, server time zone, 03:17), registered only while `judgeNightlyEnabled` is on and rescheduled when the setting changes.
- It selects conversations that are admin assistant conversations (`openConversationsOf`-style filter, without the user restriction), have a `lastMessageAt` newer than their latest `done` review's `reviewedThrough` (or no review), and have at least `judgeMinTurns` user messages.
- Sampling is a stable hash: `hash(conversationId) mod 100 < judgeSampleRate`.
- It queues reviews with `trigger: nightly`, oldest first, and stops queueing once today's judge spend reaches the cap. Anything left over goes to the next night.

## 5. Privacy, retention, permissions

- Reviews cascade with their conversation. Ending a conversation (`lib/chatbot/history.ts`: deleted, idle past retention, owner demoted) also deletes its reviews, because findings quote its text.
- `lib/members/erase-inventory.ts`, `erase-copy.ts` and `docs/privacy.md` list `toolLog`, reviews and findings.
- Everything is admin-only (`adminAction`, and loaders with `assertAdmin()`). The Support role gets no access.

## 6. MCP

- `actions/admin/conversation-review.ts` goes in `ACTION_MODULES`, so `reviewConversation` and `setFindingStatus` become tools.
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
  - re-review keeping triaged findings
  - both actions (validation, refusals, audit)
- `conversation-review.pg.test.ts` checks the cascades and the review deletion when a conversation ends.
- `evals/judge/` holds three hand-written conversations with planted errors (a wrong count against a tool result, a missing capability and an unneeded refusal), run with a recorded judge response. It checks the schema, verify and storage end to end, and gives Project B a starting point.
- Component tests: Findings tab (filters, empty state), review section (states, disabled without a provider) and triage.
- Playwright (`e2e/admin/`): queue a review on a seeded conversation with a stubbed judge, see findings, and triage one, using `data-testid`s.
- Housekeeping: migration (named per `check-migrations.mjs`), changelog fragment, `env:docs` if any variable is added (none planned), design-system check and coverage floors.
