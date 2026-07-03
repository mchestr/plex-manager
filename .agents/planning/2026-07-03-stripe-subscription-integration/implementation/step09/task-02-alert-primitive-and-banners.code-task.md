# Task: Alert primitive + past-due and pending-invite banners

## Description
Add a reusable `Alert` component and surface a persistent past-due warning banner and a
pending-invite notice from the authenticated layout.

## Background
No generic banner/alert primitive exists (only feature-specific callouts). Past-due users
keep access but must see a persistent "payment failed — update your payment method"
banner linking to the Billing Portal (R9); users with a pending Plex invite see a
"check your email to accept" notice (R3). Both belong in the `(app)` layout, driven by
server-side flags. See `research/ui-and-testing.md` §C and `design/detailed-design.md`
§4.5/FR-13/FR-16.

## Technical Requirements
1. Create `components/ui/alert.tsx` with a `tone` (info/warning/danger/success), optional
   icon, message, and optional action slot/link; accessible (`role="alert"` where
   appropriate).
2. Surface a past-due banner in `app/(app)/layout.tsx` (or header) shown only when the
   current user's subscription status is `PAST_DUE`, linking to the Billing Portal.
3. Surface a pending-invite notice when `Subscription.plexInviteStatus === 'pending'`.
4. Drive both from a server-side lookup; do not show when not applicable.

## Dependencies
- Step01/06 (`Subscription.status`, `plexInviteStatus`), Step09 task-01 (portal action),
  `(app)` layout.

## Implementation Approach
1. Build the presentational `Alert` first (with tests), then wire the two banners.
2. Compute the flags server-side once per request and pass to the layout/banner.

## Acceptance Criteria

1. **Alert renders by tone**
   - Given an `Alert` with a given tone/message/action
   - When rendered
   - Then it displays the correct styling, message, and action, with appropriate a11y.

2. **Past-due banner conditional**
   - Given the current user's subscription is `PAST_DUE`
   - When an `(app)` page renders
   - Then the past-due banner appears with a link to manage payment; it is absent
     otherwise.

3. **Pending-invite notice conditional**
   - Given `plexInviteStatus === 'pending'`
   - When an `(app)` page renders
   - Then the "check your email to accept the Plex invite" notice appears; absent
     otherwise.

4. **No banners for healthy users**
   - Given an active subscriber with an accepted invite
   - When pages render
   - Then neither banner shows.

5. **Unit tests**
   - Given `Alert` and banner tests
   - When run
   - Then tone rendering and each banner's conditional visibility are covered.

## Metadata
- **Complexity**: Medium
- **Labels**: ui, components, alert, layout, stripe
- **Required Skills**: React, Next.js layouts, Tailwind, Testing Library
