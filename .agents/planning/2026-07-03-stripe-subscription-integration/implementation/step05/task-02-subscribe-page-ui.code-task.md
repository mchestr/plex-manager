# Task: /subscribe page and success placeholder UI

## Description
Build the `/subscribe` page that lists offered plans and starts Checkout, plus a
`/subscribe/success` placeholder for the post-payment return.

## Background
Step04 created a placeholder `/subscribe` route outside the `(app)` guard. This task
fills it: it renders offered prices from `getOfferedPrices()` with Subscribe buttons
wired to `startCheckout`, using existing UI primitives (`Button`, `LoadingSpinner`) per
the reuse rule. If Stripe is disabled, the page must not be usable. See
`research/ui-and-testing.md` §C and `design/detailed-design.md` §4.5/FR-9.

## Technical Requirements
1. Render offered plans (product name, amount, currency, interval) from
   `getOfferedPrices()`; each has a Subscribe button calling `startCheckout(priceId)` and
   redirecting to the returned Checkout URL.
2. Show loading and error states using existing primitives and `useToast` for errors.
3. When Stripe is disabled/unconfigured, redirect away (e.g. home) or show unavailable —
   the page must not offer subscription.
4. Add a `/subscribe/success` placeholder that will display provisioning status
   (completed in step09); for now confirm return and link back into the app.
5. Add `data-testid`s to interactive elements for future E2E.

## Dependencies
- Step03 (`getOfferedPrices`), Step05 task-01 (`startCheckout`), Step04 (route + gate),
  `components/ui/*`.

## Implementation Approach
1. Server-render the price list; use a small client component for the Subscribe button +
   redirect.
2. Guard the page against the disabled state up front.

## Acceptance Criteria

1. **Lists offered plans**
   - Given Stripe enabled with configured prices
   - When a gated user visits `/subscribe`
   - Then each offered plan is displayed with its price details and a Subscribe button.

2. **Starts checkout**
   - Given the user clicks Subscribe on a plan
   - When the action returns a URL
   - Then the browser is redirected to Stripe Checkout; a loading state shows meanwhile.

3. **Disabled not usable**
   - Given Stripe disabled/unconfigured
   - When the page is visited
   - Then no subscribe option is offered (redirect/unavailable state).

4. **Error surfaced**
   - Given `startCheckout` returns `{error}`
   - When Subscribe is clicked
   - Then an error toast is shown and the user remains on the page.

5. **Component tests**
   - Given the page/component tests
   - When run
   - Then plan rendering, subscribe-click→redirect, loading, disabled, and error paths
     are covered (mocked action + prices).

## Metadata
- **Complexity**: Medium
- **Labels**: ui, subscribe, stripe, nextjs
- **Required Skills**: Next.js App Router, React, Testing Library
