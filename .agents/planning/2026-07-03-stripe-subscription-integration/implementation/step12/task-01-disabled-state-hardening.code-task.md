# Task: Disabled-state hardening audit

## Description
Audit and harden the entire feature so that with `stripeEnabled = false` the application
behaves exactly as it did before the feature existed, with no visible surfaces and no
Plex side effects.

## Background
The master toggle off must equal today's behavior (FR-2). Disabling is safe/reversible:
no cancellations, no removals; the webhook still records status but skips Plex side
effects (FR-4/FR-29). This task is a cross-cutting verification/hardening pass across
auth, gate, `/subscribe`, banners, admin CTAs, and the webhook. See
`design/detailed-design.md` §6/FR-2/FR-4/FR-29.

## Technical Requirements
1. Verify/enforce that when disabled: the auth gate is a no-op; `/subscribe` is not
   usable; no subscribe CTAs/banners render; the subscription column/actions degrade
   sensibly; and the webhook records status but performs no Plex grant/revoke.
2. Ensure toggling off does not cancel Stripe subscriptions or remove Plex access.
3. Add regression tests asserting the disabled behavior at each surface.

## Dependencies
- All prior steps (this is an integration hardening pass).

## Implementation Approach
1. Enumerate each feature surface and confirm its disabled behavior; fix any that leak.
2. Centralize the enabled-check where practical to avoid divergence.

## Acceptance Criteria

1. **Auth/gate no-op when disabled**
   - Given `stripeEnabled = false`
   - When users authenticate/navigate
   - Then behavior matches pre-feature (non-members rejected at login; no `/subscribe`
     redirect).

2. **No subscribe surfaces**
   - Given disabled
   - When any page renders
   - Then no subscribe CTAs or subscription banners appear.

3. **Webhook records but no side effects**
   - Given disabled and an incoming event
   - When processed
   - Then subscription status is recorded but NO Plex grant/revoke is enqueued.

4. **Toggle-off is safe**
   - Given active subscriptions exist and the admin disables Stripe
   - When disabled
   - Then no Stripe cancellations and no Plex removals occur; subscribers fall back to
     normal Plex-access rules.

5. **Regression tests**
   - Given the disabled-state test suite
   - When run
   - Then each surface's disabled behavior is asserted.

## Metadata
- **Complexity**: Medium
- **Labels**: hardening, stripe, regression, safety
- **Required Skills**: Full-stack integration testing, TypeScript
