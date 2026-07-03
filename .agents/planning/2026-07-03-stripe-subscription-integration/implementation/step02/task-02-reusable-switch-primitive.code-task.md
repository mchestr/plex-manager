# Task: Add reusable Switch UI primitive

## Description
Create a reusable toggle switch component in `components/ui/` so the Stripe master
toggle (and future toggles) share consistent styling, behavior, and accessibility.

## Background
The project rule is to reuse `components/ui/*` rather than hand-rolling controls, but no
reusable Switch exists — toggles are currently hand-rolled (e.g. the watchlist-sync
`role="switch"` button and `LLMToggle`). This task extracts a single primitive from
those patterns. See `research/ui-and-testing.md` §A/§C and `design/detailed-design.md`
§4.5/§8.5.

## Technical Requirements
1. Implement `components/ui/switch.tsx` exporting a controlled `Switch` component with
   at least `checked`, `onChange` (or `onCheckedChange`), `disabled`, and an accessible
   label mechanism.
2. Use `role="switch"` with `aria-checked`, keyboard operability, visible focus, and a
   `data-testid` passthrough.
3. Match the app's dark Tailwind styling (on/off colors, sliding knob) consistent with
   the existing hand-rolled toggle.
4. Support a disabled/loading visual state.

## Dependencies
- Tailwind; existing toggle markup in `components/admin/settings/*` as reference.
- No external switch library (hand-rolled per project conventions).

## Implementation Approach
1. Generalize the watchlist-sync toggle markup into a controlled component with props.
2. Keep it presentational (no data fetching); consumers wire `onChange` to actions.

## Acceptance Criteria

1. **Toggles via click**
   - Given a `Switch` with `checked={false}`
   - When the user clicks it
   - Then `onChange`/`onCheckedChange` is called with `true`.

2. **Reflects checked state**
   - Given `checked={true}`
   - When rendered
   - Then `aria-checked="true"` and the knob is in the on position.

3. **Disabled blocks interaction**
   - Given `disabled`
   - When the user clicks it
   - Then no change handler fires and it is visually/functionally disabled.

4. **Accessible + keyboard operable**
   - Given the switch is focused
   - When activated via keyboard (Space/Enter)
   - Then it toggles, exposing `role="switch"` and an accessible name.

5. **Unit tests**
   - Given the component tests
   - When run
   - Then click, keyboard, checked-state, and disabled behaviors are covered
     (Testing Library + user-event).

## Metadata
- **Complexity**: Low
- **Labels**: ui, components, accessibility, tailwind
- **Required Skills**: React, Tailwind, ARIA/accessibility, Testing Library
