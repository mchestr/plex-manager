# Task: Plex access grant job (auto-invite + auto-accept with pending fallback)

## Description
Implement the `PLEX_ACCESS_GRANT` job that invites a user to the Plex server and
auto-accepts using their stored Plex token, recording a pending status when auto-accept
cannot run.

## Background
On a successful subscription, the app auto-invites the user via
`inviteUserToPlexServer({url,token}, email)` and auto-accepts via
`acceptPlexInvite(userToken, inviteID)` using the user's stored `plexAuthToken`. If the
token is missing/expired, leave the invite pending (do NOT throw) and record status so
the UI can prompt the user to accept via email (R3/Q10c). The active server is loaded via
`prisma.plexServer.findFirst({ where: { isActive: true } })`. See
`research/webhook-and-jobs.md` (GRANT job) and `design/detailed-design.md` §4.4/FR-12/13.

## Technical Requirements
1. Implement `processPlexAccessGrant(job)` in `lib/queue/jobs/stripe.ts`: load the active
   Plex server and the user (email, `plexUserId`, `plexAuthToken`).
2. Call `inviteUserToPlexServer`; on invite failure, throw to trigger retry.
3. If a valid `plexAuthToken` and invite id are present, call `acceptPlexInvite`; on
   accept failure, record `plexInviteStatus = 'pending'` and do NOT throw.
4. On success, record `plexInviteStatus = 'accepted'` (else `'sent'`/`'pending'`).
5. Be idempotent/safe if the user already has access.

## Dependencies
- `lib/connections/plex-invitations.ts` helpers; Step01 (`Subscription.plexInviteStatus`);
  Step06 (job types + processor module).

## Implementation Approach
1. Mirror how `unshareUserLibrary` loads the active server config.
2. Separate invite from accept so accept failure degrades gracefully to pending.

## Acceptance Criteria

1. **Invite + auto-accept on token present**
   - Given a user with a valid `plexAuthToken`
   - When the grant job runs
   - Then invite and accept are called and `plexInviteStatus` is `accepted`.

2. **Pending when token missing/expired**
   - Given the auto-accept fails or no token exists
   - When the grant job runs
   - Then the invite is still sent, `plexInviteStatus` is `pending`, and the job does NOT
     throw.

3. **Invite failure retries**
   - Given `inviteUserToPlexServer` fails
   - When the job runs
   - Then it throws (so BullMQ retries).

4. **No active server handled**
   - Given no active Plex server configured
   - When the job runs
   - Then it fails cleanly with a logged error (retry/observable), not an unhandled crash.

5. **Processor unit tests**
   - Given grant-job tests
   - When run
   - Then token-present, token-missing/pending, invite-failure, and no-server paths are
     covered (mock plex helpers + Prisma).

## Metadata
- **Complexity**: Medium
- **Labels**: bullmq, plex, provisioning, stripe, jobs
- **Required Skills**: BullMQ, Plex API integration, Prisma, TypeScript
