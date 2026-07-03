# Summary: Stripe Subscription Integration (PDD)

**Date:** 2026-07-03
**Project dir:** `.agents/planning/2026-07-03-stripe-subscription-integration/`

## Artifacts created

```
.agents/planning/2026-07-03-stripe-subscription-integration/
├── rough-idea.md              # Original request + interpretation
├── idea-honing.md             # Q1–Q10 + refinements R1–R10 (requirements Q&A)
├── research/
│   ├── stripe-integration.md  # Stripe SDK/API: checkout, portal, webhooks, cancel, versioning
│   ├── auth-gating.md         # Relaxing ACCESS_DENIED (toggle-gated) + the (app) guard
│   ├── data-model.md          # Prisma models, encryption registry, grandfather migration
│   ├── webhook-and-jobs.md    # Webhook route + BullMQ jobs + Plex helper signatures
│   └── ui-and-testing.md      # Admin/config UI, components/ui inventory, test conventions
├── design/
│   └── detailed-design.md     # Standalone design (overview→appendices, mermaid diagrams)
├── implementation/
│   └── plan.md                # 12 phased, test-driven, demoable steps + checklist
└── summary.md                 # This document
```

## Design in brief

An optional, admin-toggled Stripe subscription feature. **Off by default → the app
behaves exactly as today** (non-members rejected at login, no subscribe flow). When an
admin enables it (only possible once secret key + webhook secret + ≥1 price id are
saved):

- Non-members can log in but are gated to `/subscribe` (guard in the `(app)` layout;
  the `lib/auth.ts` `ACCESS_DENIED` relaxation is conditional on the toggle).
- Subscribe → Stripe Checkout (identity bound via `client_reference_id`, promo codes
  enabled, multiple prices allowed, all binary-equivalent access).
- A signature-verified webhook enqueues BullMQ jobs: record status, then **grant**
  Plex access (auto-invite + auto-accept, pending-invite fallback) and **revoke** at
  period-end cancellation — with hard guards so admins/exempt/non-Stripe-managed users
  are never removed. Access retained during `past_due` dunning.
- Users see status in-app and manage via the Stripe Billing Portal; past-due users see
  a banner.
- Admins get everything folded into the existing user-list page: status column, filter,
  Stripe deep link, and cancel / grant-comp / toggle-exempt actions.

Data: `Subscription` + `StripeEvent` (idempotency) models, `User.isExempt`/
`exemptReason`, Stripe fields on the encrypted `Config` singleton. Existing members are
grandfathered by a **SQL data migration** marking all current users exempt (valid
because a `User` row only exists today if it passed the server-access check).

## Implementation approach

12 incremental, test-driven steps (see `implementation/plan.md`), core end-to-end
first: data/config/client → visible gating → Checkout → webhook spine (status → grant →
guarded revoke) → self-service + admin surfaces → hardening/docs/E2E. Each step is
independently demoable and leaves the feature safely off unless enabled.

## Next steps

1. Review `design/detailed-design.md` and `implementation/plan.md`.
2. Begin implementation at Step 1 (schema + grandfathering migration).
3. Confirm the build-time open items in design §8.4 against the installed `stripe` SDK:
   whether to set `apiVersion`, the exact `current_period_end` path, and the webhook
   endpoint API version.

## Areas that may need further refinement
- Exact Stripe SDK version pinning / API version (flagged; verify at build time —
  local toolchain unavailable this session per project memory).
- Whether the account/status surface is a dedicated `/account` route or folded into an
  existing dashboard area (design leaves this flexible).
- Whether to later add richer pending-invite notifications (Discord/email) — deferred.
