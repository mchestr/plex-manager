# Task: Conditionally relax ACCESS_DENIED based on stripeEnabled

## Description
Allow Plex-authenticated non-members to create a session only when the Stripe
integration is enabled; otherwise preserve today's behavior exactly.

## Background
`lib/auth.ts` calls `checkUserServerAccess()` in the Plex `authorize` flow and throws
`ACCESS_DENIED` when the user has no server access. This must remain unchanged when
Stripe is disabled (default). When enabled, the no-access case should NOT throw so the
user can proceed to the subscribe gate; genuine Plex/API failures must still error. See
`research/auth-gating.md` §1 and `design/detailed-design.md` FR-2/FR-6.

## Technical Requirements
1. Read `stripeEnabled` from `Config` within the `authorize` flow.
2. When `stripeEnabled === false`: throw `ACCESS_DENIED` on no-access (unchanged).
3. When `stripeEnabled === true`: skip the throw for the no-access case and allow the
   user record to be created/updated as usual.
4. Preserve error handling for real access-check failures (API error) regardless of the
   flag; downgrade the "denied" log to info when allowing through.

## Dependencies
- Step01/Step02 (`Config.stripeEnabled`); `lib/auth.ts`,
  `lib/connections/plex-user-access.ts` (`checkUserServerAccess`).

## Implementation Approach
1. Branch on the flag around the existing `ACCESS_DENIED` throw only; leave the rest of
   the authorize flow intact.
2. Distinguish "no access" (relaxable) from "check failed" (always error).

## Acceptance Criteria

1. **Disabled preserves current behavior**
   - Given `stripeEnabled = false` and a non-member logs in
   - When `authorize` runs
   - Then `ACCESS_DENIED` is thrown (identical to today).

2. **Enabled allows non-member session**
   - Given `stripeEnabled = true` and a non-member logs in
   - When `authorize` runs
   - Then no `ACCESS_DENIED` is thrown and the user record is created/updated.

3. **API failure still errors**
   - Given the access check fails due to a Plex/API error (not a clean no-access)
   - When `authorize` runs (flag either state)
   - Then an error is raised rather than silently allowing access.

4. **Members/admins unaffected**
   - Given a user who has server access
   - When `authorize` runs
   - Then they sign in normally in both flag states.

5. **Unit tests**
   - Given auth tests
   - When run
   - Then disabled-throws, enabled-allows, api-failure-errors, and member-unaffected are
     covered (mock `checkUserServerAccess` + config).

## Metadata
- **Complexity**: Medium
- **Labels**: auth, nextauth, security, stripe, gating
- **Required Skills**: NextAuth, TypeScript, auth flows
