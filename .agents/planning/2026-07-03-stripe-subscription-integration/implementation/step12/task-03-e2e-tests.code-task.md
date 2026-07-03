# Task: Playwright E2E for gating and admin visibility

## Description
Add end-to-end tests covering the subscription gate and admin visibility, using stable
`data-testid` selectors and Stripe in test/stubbed mode (no real payment in CI).

## Background
E2E lives in `e2e/` (Playwright). Project convention mandates `data-testid` selectors and
authenticated-session setup. Full payment flows are not run in CI; Stripe is stubbed/test
mode, and provisioning is asserted at the app boundary. See `research/ui-and-testing.md`
§D and `design/detailed-design.md` §7.

## Technical Requirements
1. E2E: with Stripe enabled, a Plex-authenticated non-member is redirected to
   `/subscribe` and sees offered plans.
2. E2E: an admin can enable Stripe from settings (toggle unlocks once configured) and the
   users page shows the subscription column.
3. E2E: with Stripe disabled, no subscribe surfaces appear and existing behavior holds.
4. Use `data-testid` selectors throughout; add missing test IDs to components as needed.
5. Stub/mocked Stripe so tests do not perform real charges; do not attempt a real
   Checkout payment in CI.

## Dependencies
- Steps 1–11 implemented; `e2e/` setup and authenticated-session patterns.

## Implementation Approach
1. Reuse the authenticated-session setup; drive the gate/admin flows.
2. Where Checkout redirect occurs, assert the redirect intent rather than completing
   payment.

## Acceptance Criteria

1. **Gated redirect**
   - Given Stripe enabled and a non-member session
   - When they navigate to an app route
   - Then they land on `/subscribe` with offered plans (selected by `data-testid`).

2. **Admin enable + column**
   - Given an admin with valid Stripe config
   - When they enable the toggle
   - Then it succeeds and the users page shows the subscription column.

3. **Disabled behavior**
   - Given Stripe disabled
   - When navigating
   - Then no subscribe surfaces appear and prior behavior holds.

4. **Stable selectors**
   - Given the E2E specs
   - When run
   - Then they use `data-testid` selectors (no CSS/text/DOM-structure selectors) and pass
     reliably.

## Metadata
- **Complexity**: Medium
- **Labels**: e2e, playwright, stripe, testing
- **Required Skills**: Playwright, E2E testing, Next.js
