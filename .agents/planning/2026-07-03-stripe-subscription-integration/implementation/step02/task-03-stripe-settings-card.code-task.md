# Task: Stripe settings card in admin settings page

## Description
Add a Stripe configuration section to the admin settings page so admins can enter
credentials/price IDs and flip the master toggle, with the toggle disabled until the
integration is fully configured.

## Background
`app/admin/settings/page.tsx` renders card sections per integration (header with icon/
title/desc + `FeatureStatusBadge` + optional toggle, then a form component). Secrets use
`StyledInput type="password"` as in `ServerForm`/`DiscordIntegrationForm`. This task adds
a `StripeSettingsForm` and wires it into the settings page, using the actions (task-01)
and the `Switch` primitive (task-02). See `research/ui-and-testing.md` §A and
`design/detailed-design.md` §4.5.

## Technical Requirements
1. Create `components/admin/settings/StripeSettingsForm.tsx` with password inputs for the
   secret key and webhook secret, an input for price ids, and the master `Switch`.
2. Wire save to `updateStripeSettings` and the toggle to `setStripeEnabled`, using
   `useToast` for feedback and refreshing after success.
3. Disable the enable toggle (with an explanatory message) until required config is
   present, based on `getStripeConfig()`.
4. Render a Stripe card in `app/admin/settings/page.tsx` matching existing card layout,
   with a `FeatureStatusBadge` reflecting enabled state.
5. Follow the existing secret-input display pattern (masked; leave-blank-to-keep as used
   by other credential forms) so secrets are not exposed to the client.

## Dependencies
- Task-01 (config actions), Task-02 (`Switch`), existing `StyledInput`,
  `FeatureStatusBadge`, `useToast`.

## Implementation Approach
1. Mirror an existing integration card + form (e.g. Discord/ServerForm) for structure
   and styling.
2. Compute the "can enable" condition from `getStripeConfig()` and drive the toggle's
   disabled state + helper text from it.

## Acceptance Criteria

1. **Card renders in settings**
   - Given an admin views `/admin/settings`
   - When the page loads
   - Then a Stripe section shows secret/webhook/price-id inputs, the master toggle, and a
     status badge.

2. **Toggle disabled until configured**
   - Given required config is incomplete
   - When the card renders
   - Then the enable toggle is disabled with a message stating what is required.

3. **Save persists via action + toast**
   - Given valid inputs
   - When the admin saves
   - Then `updateStripeSettings` is called and a success toast shows; errors surface via
     error toast.

4. **Enable/disable via toggle**
   - Given complete config
   - When the admin flips the toggle
   - Then `setStripeEnabled` is called and the badge/state updates accordingly.

5. **Secrets not exposed + component tests**
   - Given the rendered form
   - When inspected/tested
   - Then raw secret values are not sent to the client, and tests cover disabled-toggle,
     save, and enable/disable flows (mocked actions + toast).

## Metadata
- **Complexity**: Medium
- **Labels**: ui, admin, settings, stripe, forms
- **Required Skills**: React, Next.js, Tailwind, Testing Library
