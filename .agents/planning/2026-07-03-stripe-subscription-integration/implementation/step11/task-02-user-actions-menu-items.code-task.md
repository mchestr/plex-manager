# Task: Add subscription actions to the user actions menu

## Description
Add Cancel Subscription, Grant Access (comp), Toggle Exempt, and a "View in Stripe" link
to the admin user-row actions menu, using the existing confirm-modal and toast patterns.

## Background
`user-actions-menu.tsx` renders a portal dropdown; each action is a small button
component (e.g. `UnshareUserButton`) that calls a server action, confirms destructive
actions via `ConfirmModal` (`components/admin/shared/confirm-modal.tsx`), and toasts.
This task adds the subscription actions wired to step11 task-01 and a deep link to the
Stripe dashboard. See `research/ui-and-testing.md` §B and `design/detailed-design.md`
§4.5/FR-22..FR-25.

## Technical Requirements
1. Add action buttons/components for Cancel Subscription (active/past_due only),
   Grant Access/comp (when not exempt), and Toggle Exempt, each calling the respective
   action from `actions/admin/subscriptions.ts`.
2. Use `ConfirmModal` for destructive/confirming actions (cancel, grant) with clear
   messaging; show success/error via `useToast`; refresh on success.
3. Add a "View in Stripe" link (opens the customer/subscription in the Stripe dashboard)
   shown when `stripeCustomerId` is present.
4. Conditionally render each item based on user/subscription/exempt state; add
   `data-testid`s.

## Dependencies
- Step11 task-01 (actions), Step10 (DTO fields incl. `stripeCustomerId`),
  `ConfirmModal`, `useToast`.

## Implementation Approach
1. Mirror `UnshareUserButton` structure for each new action.
2. Compute conditional visibility from the row's subscription/exempt fields.

## Acceptance Criteria

1. **Cancel action**
   - Given a user with an active subscription
   - When the admin confirms Cancel Subscription
   - Then `adminCancelSubscription` is called and a success/error toast shows.

2. **Grant action**
   - Given a non-exempt user
   - When the admin confirms Grant Access
   - Then `adminGrantAccess` is called (user becomes exempt/comp) with feedback.

3. **Toggle exempt**
   - Given any user
   - When the admin toggles exempt
   - Then `adminToggleExempt` is called and the row reflects the change after refresh.

4. **Stripe link + conditional rendering**
   - Given a user with a `stripeCustomerId`
   - When the menu renders
   - Then a "View in Stripe" link is present; actions appear only when applicable to the
     user's state.

5. **Component tests**
   - Given actions-menu tests
   - When run
   - Then each action's confirm→call→toast flow, conditional rendering, and the Stripe
     link are covered (mock actions + toast + ConfirmModal).

## Metadata
- **Complexity**: Medium
- **Labels**: admin, ui, users-list, actions, stripe
- **Required Skills**: React, Testing Library, Next.js
