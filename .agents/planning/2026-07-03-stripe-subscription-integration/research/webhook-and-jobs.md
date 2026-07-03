# Research: Webhook Route + BullMQ Job Wiring

Based on `app/api/**/route.ts`, `lib/queue/**`, `lib/connections/plex-invitations.ts`,
and `actions/user-queries.ts`.

## API route conventions
- Handlers: `export async function POST(request: NextRequest)`; return
  `NextResponse.json(body, { status })`. Config with `export const dynamic = 'force-dynamic'`.
- Existing routes apply `adminRateLimiter(request)` + `requireAdminAPI(request)` for
  admin endpoints and use `createSafeError(ErrorCode.X, msg)` for error bodies.
- The Stripe webhook route is **public** (no admin auth) but authenticated by the
  Stripe signature instead. Apply a rate limiter but NOT admin auth.

## Raw body in App Router (for signature verification)
- App Router `Request`/`NextRequest` supports `await request.text()` /
  `request.arrayBuffer()`. The body stream is single-use: read the raw text ONCE, use
  it for `constructEvent`, and read `event.data` from the parsed event (do not call
  `request.json()` after `request.text()`).
- Route:
  ```ts
  // app/api/stripe/webhook/route.ts
  export const dynamic = "force-dynamic"
  export async function POST(request: NextRequest) {
    const rawBody = await request.text()
    const sig = request.headers.get("stripe-signature")
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig!, webhookSecret)
    } catch (err) {
      return NextResponse.json({ error: "invalid signature" }, { status: 400 })
    }
    // idempotency: skip if event.id already in StripeEvent
    // enqueue a job carrying the (verified) event, then return 200 fast
    await addJob("stripe:webhook", { eventId: event.id, type: event.type })
    return NextResponse.json({ received: true })
  }
  ```
- Note: NO body parser to disable (that was the Pages Router `bodyParser:false` gotcha).
  App Router route handlers don't pre-parse the body.

### What to enqueue
Two viable shapes:
- (A) Enqueue only `{eventId}` and have the job **re-fetch** the event from Stripe
  (`stripe.events.retrieve(eventId)`) — most tamper-proof, avoids stale/oversized
  payloads in Redis.
- (B) Enqueue the verified event object directly — fewer API calls.
**Design will use (A)** for correctness (re-fetch guarantees we act on Stripe's
current truth and keeps the queue payload tiny). Persist `event.id` to `StripeEvent`
inside the job transaction for idempotency.

## BullMQ wiring (replicate for new job types)
- `lib/queue/types.ts`:
  ```ts
  export const JOB_TYPES = {
    WATCHLIST_SYNC_USER: "watchlist:sync:user",
    WATCHLIST_SYNC_ALL: "watchlist:sync:all",
  } as const
  export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES]
  export type JobTrigger = "manual" | "scheduled" | "admin"
  export interface JobPayloadMap { /* jobType -> payload */ }
  export interface JobResultMap  { /* jobType -> result  */ }
  export type TypedJob<T extends JobType> = Job<JobPayloadMap[T], JobResultMap[T]>
  ```
- `lib/queue/client.ts`: `addJob<T>(jobType, data, options?) : Promise<string>`
  (default retries: 3, exp backoff 5/10/20s; jobId defaults to `${jobType}:${ts}` —
  we override `jobId` with the Stripe event id for extra dedupe).
- `lib/queue/jobs/index.ts`: `getJobProcessor(jobType)` chains per-domain lookups;
  add `getStripeProcessor(jobType)`.
- Processor signature (from `watchlist-sync.ts`):
  ```ts
  export async function processX(job: Job<Payload, Result>): Promise<Result> {
    const { ... } = job.data
    logger.info("start", { jobId: job.id })
    // ...work...; throw to trigger retry
    return result
  }
  export function getStripeProcessor(jobType: string): ((job: Job)=>Promise<unknown>) | null {
    switch (jobType) { case JOB_TYPES.STRIPE_WEBHOOK: return processStripeWebhook as ...; default: return null }
  }
  ```
- `lib/queue/worker.ts` dispatches via `getJobProcessor(job.name)`, invokes
  `await processor(job)`, logs completed/failed, retries per opts. Worker started in
  `lib/instrumentation/node.ts`.

### New job types
```ts
STRIPE_WEBHOOK: "stripe:webhook",           // process a verified event by id
PLEX_ACCESS_GRANT: "plex:access:grant",     // invite + auto-accept
PLEX_ACCESS_REVOKE: "plex:access:revoke",   // unshare on cancel/delete
```
The `stripe:webhook` processor re-fetches the event, updates `Subscription`, and (for
provisioning/removal) enqueues `plex:access:grant` / `plex:access:revoke`. Splitting
keeps each job small and independently retryable; Plex API flakiness retries without
re-processing the Stripe event.

## Plex membership function signatures (exact)
`lib/connections/plex-invitations.ts`:
```ts
inviteUserToPlexServer(
  serverConfig: { url: string; token: string },
  email: string,
  inviteSettings?: InviteSettings
): Promise<{ success: boolean; inviteID?: number; error?: string }>

acceptPlexInvite(
  userToken: string,
  inviteID: number
): Promise<{ success: boolean; error?: string }>

unshareUserFromPlexServer(
  serverConfig: { url: string; token: string },
  plexUserId: string
): Promise<{ success: boolean; error?: string }>
```

## Loading the active Plex server (from existing caller)
`actions/user-queries.ts` → `unshareUserLibrary`:
```ts
const plexServer = await prisma.plexServer.findFirst({ where: { isActive: true } })
if (!plexServer) return { success: false, error: "No active Plex server configured" }
await unshareUserFromPlexServer({ url: plexServer.url, token: plexServer.token }, user.plexUserId)
```
`PlexServer` fields: `url`, `token`, `adminPlexUserId?`, `machineIdentifier?`,
`isActive`.

## GRANT job (invite + auto-accept — Q1, Q10c fallback)
```
1. load active PlexServer + user (email, plexUserId, plexAuthToken)
2. invite = inviteUserToPlexServer({url,token}, user.email)
   - if !invite.success -> throw (retry)
3. if user.plexAuthToken and invite.inviteID:
     accept = acceptPlexInvite(user.plexAuthToken, invite.inviteID)
     if !accept.success -> record "invite pending", DO NOT throw (leave pending + notify)
   else:
     record "invite pending" (missing token) — user must accept via email (Q10c)
4. persist invite/accept state on Subscription (e.g. inviteStatus: sent|accepted|pending)
```
(Optional field on Subscription: `plexInviteStatus String?` — add if we surface it.)

## REVOKE job (cancel/delete — Q6 + Q9 guards)
```
GUARDS (must all pass before unshare):
  - user is NOT admin
  - user.isExempt === false
  - subscription is Stripe-managed (has stripeSubscriptionId)
  - status indicates removal (CANCELED/UNPAID), NOT past_due
then:
  load active PlexServer; unshareUserFromPlexServer({url,token}, user.plexUserId)
  update Subscription status; log
```
Guards are the single most important safety property (Q9): removal must never touch
admins, exempt/grandfathered users, or anyone without a Stripe-managed subscription.

## Reliability notes
- Return 200 to Stripe as soon as the event is verified + persisted-for-idempotency +
  enqueued. All Plex/DB side effects happen in retryable jobs.
- Idempotency at two layers: `StripeEvent` row (event.id) and BullMQ `jobId = event.id`.
- Dunning (Q10a): `invoice.payment_failed` → status PAST_DUE, NO revoke job.
```
