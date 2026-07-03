# Task: Subscription status view with Manage button

## Description
Build the user-facing subscription status surface showing plan, renewal/period-end,
state, and a "Manage subscription" button that opens the Billing Portal. Also complete
the `/subscribe/success` provisioning status.

## Background
Users see current subscription status natively (Q4), with management offloaded to the
Billing Portal (step09 task-01). The renewal date must be read version-safely. When the
subscription is set to cancel at period end, show "cancels on <date>". Re-subscribe (R8)
is handled by the existing gate routing canceled users back to `/subscribe`. See
`design/detailed-design.md` §4.5/FR-14/FR-15.

## Technical Requirements
1. Add a status surface (account/status area) that displays the user's subscription
   plan, state (active/past_due/canceled), and renewal/period-end date; show "cancels on
   <date>" when `cancelAtPeriodEnd`.
2. Add a "Manage subscription" button wired to `openBillingPortal()` with loading/error
   handling via `useToast`.
3. Complete `/subscribe/success` to reflect provisioning/invite status (accepted vs
   pending) after returning from Checkout.
4. Handle absent period-end gracefully (fallback text, no crash).

## Dependencies
- Step09 task-01 (portal action), Step03 (period-end reader), Step01/06 (subscription
  data), `components/ui/*`.

## Implementation Approach
1. Server-fetch the user's subscription; render states; client button for portal
   redirect.
2. Reuse `Alert` (task-02) for past-due/pending context where relevant.

## Acceptance Criteria

1. **Displays status**
   - Given an active subscriber
   - When they view the status surface
   - Then plan, state, and renewal/period-end date are shown.

2. **Manage opens portal**
   - Given the user clicks "Manage subscription"
   - When `openBillingPortal()` returns a URL
   - Then they are redirected to the Stripe Billing Portal (loading shown; errors toast).

3. **Cancel-at-period-end messaging**
   - Given `cancelAtPeriodEnd` is true
   - When the status renders
   - Then it shows "cancels on <date>".

4. **Success page reflects provisioning**
   - Given a user returns to `/subscribe/success`
   - When it renders
   - Then it reflects accepted vs pending invite status.

5. **Component tests**
   - Given status/success component tests
   - When run
   - Then status rendering (each state), manage-click→redirect, cancel messaging, and the
     absent-period-end fallback are covered.

## Metadata
- **Complexity**: Medium
- **Labels**: ui, subscription, stripe, account
- **Required Skills**: Next.js, React, Testing Library
