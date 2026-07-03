# Task: Register Stripe job types and processor dispatch

## Description
Add the BullMQ job-type definitions and processor registration needed for Stripe webhook
processing and Plex access grant/revoke, so later processors can be dispatched.

## Background
`lib/queue/types.ts` defines `JOB_TYPES`, `JobPayloadMap`, `JobResultMap`, `JobTrigger`,
and `TypedJob`. `lib/queue/jobs/index.ts` chains per-domain lookups in
`getJobProcessor`. This task adds the type scaffolding for three jobs and wires a Stripe
processor lookup (processors implemented in step06 task-03 and steps 07/08). See
`research/webhook-and-jobs.md` and `design/detailed-design.md` §4.4.

## Technical Requirements
1. Add `STRIPE_WEBHOOK`, `PLEX_ACCESS_GRANT`, and `PLEX_ACCESS_REVOKE` to `JOB_TYPES`.
2. Define payload and result interfaces for each and register them in `JobPayloadMap`/
   `JobResultMap` (e.g. `STRIPE_WEBHOOK` payload carries `{ eventId }`).
3. Add a `getStripeProcessor(jobType)` module and wire it into `getJobProcessor` in
   `lib/queue/jobs/index.ts` (returning null for non-Stripe types).
4. Ensure the worker recognizes the new registered job types.

## Dependencies
- Existing `lib/queue/*`; Step01 models (referenced by processors later).

## Implementation Approach
1. Mirror the watchlist job-type definitions for shape/typing.
2. Keep the processor module present but delegating to functions added in later tasks
   (or export stubs that later tasks fill), avoiding orphaned code by wiring dispatch
   now and implementing bodies in 06.03/07/08.

## Acceptance Criteria

1. **Job types registered**
   - Given `JOB_TYPES`
   - When inspected
   - Then `STRIPE_WEBHOOK`, `PLEX_ACCESS_GRANT`, `PLEX_ACCESS_REVOKE` exist with typed
     payload/result entries.

2. **Dispatch wired**
   - Given `getJobProcessor(jobType)`
   - When called with a Stripe job type
   - Then it returns the Stripe processor (or the registered handler), and `null` for
     unknown types.

3. **Type safety**
   - Given `addJob(STRIPE_WEBHOOK, payload)`
   - When compiled
   - Then the payload is type-checked against `JobPayloadMap`.

4. **Unit tests**
   - Given queue-type/dispatch tests
   - When run
   - Then registration and dispatch resolution for the new types are covered.

## Metadata
- **Complexity**: Low
- **Labels**: bullmq, queue, types, stripe
- **Required Skills**: TypeScript, BullMQ
