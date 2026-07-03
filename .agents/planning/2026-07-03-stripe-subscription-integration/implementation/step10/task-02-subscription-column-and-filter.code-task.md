# Task: Subscription column and filter in admin user list

## Description
Add a subscription status column (with exempt marker) to the user table and a
subscription filter to the users list, matching existing patterns.

## Background
`user-table-row.tsx` renders columns using `Badge`-style markup; `users-filter.tsx`
defines `UsersFilter` (`plexAccess`, `role`) rendered as `StyledDropdown`s and applied in
`users-list.tsx`'s `useMemo`. This task adds a Subscription column and filter, reusing the
`Badge` primitive. Remember to bump the empty-row `colSpan`. See `research/ui-and-testing.md`
§B/§C and `design/detailed-design.md` §4.5/FR-20/FR-21.

## Technical Requirements
1. Add a "Subscription" column to `user-table-row.tsx` using `Badge` tones
   (success=active, warning=past_due, danger=canceled, neutral/`—`=none) and a distinct
   marker for exempt users (e.g. "Comp"/"Grandfathered" from `exemptReason`), plus the
   renewal date where relevant.
2. Add `subscription: 'all' | 'active' | 'past_due' | 'canceled' | 'none'` to
   `UsersFilter` and a `StyledDropdown` control in `users-filter.tsx`.
3. Apply the new filter in `users-list.tsx`'s filtering logic.
4. Update the table header and empty-row `colSpan` for the added column.

## Dependencies
- Step10 task-01 (DTO fields), `components/ui/badge.tsx`, `StyledDropdown`.

## Implementation Approach
1. Mirror the existing Access column/badge and the existing filter dropdowns.
2. Keep filtering client-side within the existing `useMemo`.

## Acceptance Criteria

1. **Column shows status**
   - Given users with various subscription states/exemptions
   - When the table renders
   - Then each row shows the correct subscription badge (or exempt marker / `—`).

2. **Filter narrows list**
   - Given the subscription filter set to a value (e.g. `active`)
   - When applied
   - Then only matching users are shown.

3. **Exempt indicated**
   - Given an exempt user with no subscription
   - When rendered
   - Then an exempt/comp/grandfathered marker is shown (distinct from "none").

4. **Layout integrity**
   - Given the added column
   - When the table has no rows
   - Then the empty-state cell spans all columns (correct `colSpan`).

5. **Component tests**
   - Given row/filter tests
   - When run
   - Then badge states, exempt marker, and filter behavior are covered.

## Metadata
- **Complexity**: Medium
- **Labels**: admin, ui, users-list, subscriptions
- **Required Skills**: React, Tailwind, Testing Library
