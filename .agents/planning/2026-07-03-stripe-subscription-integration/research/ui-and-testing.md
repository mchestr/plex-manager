# Research: Admin UI, Config UI, Components & Testing Patterns

Round-2 research. Grounds the design's UI/config surfaces and the TDD plan.

## A. Admin settings + config UI (for Stripe config + master toggle — R4)

- Settings page: `app/admin/settings/page.tsx` — card sections; each integration card
  = outer `bg-slate-800/50 border border-slate-700 rounded-lg` + header (icon/title/
  desc/`FeatureStatusBadge` + optional toggle) + a form component. Stripe gets its own
  card here (a "Subscriptions / Stripe" section), matching the LLM/Discord/server
  cards.
- Config server actions: `actions/admin/admin-config.ts` — `getConfig()`
  (`requireAdmin()`, `prisma.config.findUnique({where:{id:"config"}})`, auto-creates
  defaults), and update actions using `prisma.config.upsert(...)` with
  `updatedBy: session.user.id` + dynamic `import("next/cache").revalidatePath(...)`.
  → Add `updateStripeSettings(...)` and `setStripeEnabled(bool)` here, same shape.
  Zod-validate: when enabling, require secretKey + webhookSecret + ≥1 priceId (R4
  "block enable until configured").
- Toggle UI: **no reusable Switch primitive.** Two existing patterns:
  - `components/admin/settings/watchlist-sync-settings.tsx` — hand-rolled
    `role="switch"` button (green/slate, `data-testid`), the richer inline toggle.
  - `components/admin/settings/LLMToggle.tsx` — a `Button` that flips via server
    action + `useToast` + `router.refresh()`.
  → **Design decision:** extract a small reusable `Switch` into `components/ui/`
    (the watchlist toggle markup generalized) so the Stripe master toggle and future
    toggles share it. This is a justified extraction (2+ existing hand-rolls + new
    use). Keep scope tiny.
- Secret inputs: `components/admin/settings/ServerForm.tsx` &
  `DiscordIntegrationForm.tsx` use `StyledInput type="password"`; required only when
  the integration is enabled. Mirror for Stripe secret key + webhook secret. Note the
  encryption layer means the stored value is decrypted on read — for display, follow
  the existing "show masked / leave to keep" behavior these forms use.
- Setup wizard: steps enumerated in `types/setup.ts` `SETUP_STEPS` + switch in
  `components/setup/setup-wizard/setup-wizard.tsx`. Stripe config is **optional**, so
  it belongs in admin settings, NOT as a required wizard step (adding a wizard step
  would gate setup completion). Design: configure Stripe post-setup via admin settings.

## B. Admin user-list extension (status column, filter, actions — Admin scope + R10)

- `app/admin/users/page.tsx` → `getAllUsersWithWrapped(year)` → `<UsersList>`.
- Data type `AdminUserWithWrappedStats` in `types/admin.ts`. **Extend** with:
  `subscriptionStatus`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `isExempt`,
  `exemptReason`, `stripeCustomerId` (for the Stripe deep link).
- `getAllUsersWithWrapped` (`actions/user-queries.ts`) builds via helper maps
  (`buildPlexAccessMap`, `fetchShareStatsMap`). **Add** `fetchSubscriptionMap(userIds)`
  → `prisma.subscription.findMany({ where:{ userId:{ in }}})` → attach in the `.map`.
  (Batched; no N+1.)
- Filter: `components/admin/users/users-filter.tsx` `UsersFilter` interface
  (`plexAccess`, `role`) + `StyledDropdown` grid. **Add** `subscription:
  "all"|"active"|"past_due"|"canceled"|"none"`; filter logic in
  `users-list.tsx` `useMemo`. Remember to bump the empty-row `colSpan` when adding a
  column.
- Column: `components/admin/users/user-table-row.tsx` — add a "Subscription" `<td>`
  using the reusable `Badge` (tone: success=active, warning=past_due,
  danger=canceled, neutral/`—`=none). Also indicate exempt (e.g. a "Comp"/"Grandfathered"
  badge) since exempt users have no subscription but do have access.
- Actions: `components/admin/users/user-actions-menu.tsx` — portal dropdown; each
  action is a small button component (see `UnshareUserButton`,
  `RegenerateWrappedButton`) that calls a server action, uses `ConfirmModal`
  (`components/admin/shared/confirm-modal.tsx`) for destructive confirms, and toasts.
  **Add** (conditionally rendered): `CancelSubscriptionButton` (active/past_due only),
  `GrantAccessButton` (R10 — invite+comp; when not exempt & no active sub),
  `ToggleExemptButton`, and a plain link "View in Stripe" (when `stripeCustomerId`).
  All new server actions live in a new `actions/admin/subscriptions.ts` behind
  `requireAdmin()`.
- Confirm dialog pattern (quote): `ConfirmModal` props `{isOpen,onClose,onConfirm,
  title,message,confirmText,cancelText,confirmButtonClass}`; destructive uses
  `bg-red-600 hover:bg-red-700`.

## C. Reusable UI primitives (per CLAUDE.md: reuse, don't reinvent)

Available in `components/ui/`: `Button` (variants primary/success/danger/secondary/
ghost), `StyledInput` (password-capable), `StyledDropdown` (use this, NOT deprecated
`StyledSelect`), `StyledCheckbox`, `StyledTextarea`, **`Badge`** (tones neutral/info/
success/warning/danger — use for status column), `Card`, **`ModalShell`** (portal,
focus-trap, ESC/scroll-lock — base for subscribe/confirm modals), `useToast`
(`showSuccess/showError/showInfo`), `LoadingSpinner`, `LoadingScreen`, `ErrorState`,
`Pagination`, `DateRangePicker`, service icons.

Gaps to fill (small, justified):
- **`Switch`** — no reusable toggle exists; extract one (§A) for the master toggle.
- **`Alert`/`Banner`** — no generic banner; the past-due warning banner (R9) needs
  one. Create a small `components/ui/alert.tsx` (tone + icon + message + optional
  action) rather than another one-off (DevModeBanner/DiscordLinkCallout are
  feature-specific). Reuse it for the pending-invite notice (R3) too.
- No Skeleton component (not needed; `LoadingSpinner`/`LoadingScreen` suffice for the
  subscribe page + Stripe redirects).

## D. Testing conventions (for TDD plan)

- Jest: `jest.config.js` (jsdom, `@/` alias, testMatch `**/__tests__/**/*.test.[jt]s?(x)`
  + `*.test/spec`), `jest.setup.js` polyfills `Request/Headers/Response`, mocks
  framer-motion, sets `NEXTAUTH_SECRET`.
- Locations: `actions/__tests__/*.test.ts`, `components/__tests__/*.test.tsx`,
  API routes in top-level `__tests__/api/*.test.ts`, lib in `__tests__/lib/**`.
  Shared factories in `__tests__/utils/test-builders.ts` (has `makeAdminSession`,
  `makePrismaUser`, etc. — **extend** with `makePrismaSubscription`, a Stripe event
  fixture, and a subscription entry in `makeAdminUserWithStats`).
- Prisma: `jest.mock('@/lib/prisma', () => ({ prisma: { model: { method: jest.fn() }}}))`;
  assert with `mockResolvedValue`/`mockRejectedValue` + `toHaveBeenCalledWith`.
- Server actions: mock `next-auth` `getServerSession`, `next/cache` `revalidatePath`,
  `@/lib/auth` `authOptions`; assert `{success}`/`{error}` returns and that non-admin
  `rejects.toThrow()`.
- API routes: import the `POST`/`GET` handler; construct a `Request`/`NextRequest`;
  assert `response.status` + `await response.json()`. For the Stripe webhook: mock
  `stripe.webhooks.constructEvent` (valid → event; invalid → throw → 400), mock
  `addJob`, assert 200 + enqueue. Build the raw body as a string and set the
  `stripe-signature` header.
- Components: mock the action module + `useToast` (spy `showSuccess`/`showError`),
  render within `ToastProvider`, drive with `userEvent`, assert toasts + disabled/
  loading states. `role="switch"` for toggles.
- **BullMQ: no existing tests.** New pattern needed: mock `bullmq` `Queue`/`Worker`
  and the redis connection; unit-test processors as **plain functions** (call
  `processStripeWebhook(fakeJob)` directly with a mocked `job.data`), asserting the
  Prisma/Plex mocks — this avoids needing a live Redis and matches how other pure
  logic is tested. Mock `@/lib/connections/plex-invitations` functions to assert the
  removal **guards** (never unshare admin/exempt/non-managed) — the critical Q9 tests.
- NextAuth gate: the `authorize` callback + guard are testable by mocking
  `checkUserServerAccess`, `getConfig` (for `stripeEnabled`), and `prisma`; assert
  that disabled→throws ACCESS_DENIED as today, enabled+no-access→no throw.

## E. Notable design consequences from this round
1. Add two tiny reusable primitives: `Switch` and `Alert` (both justified by ≥2 uses).
2. Stripe config lives in **admin settings**, not the setup wizard (it's optional).
3. New server-action file `actions/admin/subscriptions.ts` (cancel/grant/toggle-exempt),
   plus Stripe config actions in `actions/admin/admin-config.ts`.
4. Extend `AdminUserWithWrappedStats` + `test-builders.ts` together.
5. The removal-guard unit tests are the highest-value safety tests (Q9).
