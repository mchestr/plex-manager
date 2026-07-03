# Rough Idea: Stripe Subscription Integration

**Captured:** 2026-07-03

## Original Request

I want to add a Stripe integration. If a user is not part of the server we should
allow them to login to Plex, but offer them an option to subscribe. Subscribe will
redirect to Stripe. We should also integrate the webhooks from Stripe so if the
subscription gets cancelled then we also remove them from the Plex server. Users
should be able to see their current subscription, and there should be an admin
dashboard, showing the users that are subscribed. Perhaps we can update the list
users page to show this information to reduce the number of admin pages.

## Initial Interpretation (to be refined during clarification)

- **New-user flow:** A user who is authenticated via Plex but is NOT a member of the
  managed Plex server should still be able to log in. Instead of full app access,
  they are offered a "Subscribe" option.
- **Subscribe → Stripe:** Clicking subscribe redirects the user to Stripe (likely
  Stripe Checkout) to start a subscription.
- **Webhooks → Plex membership sync:** Stripe webhooks drive membership. On
  successful subscription the user is (presumably) invited/added to the Plex server;
  on cancellation/expiration they are removed from the Plex server.
- **User self-service:** Subscribers can view their current subscription status
  (plan, renewal date, manage/cancel — likely via Stripe Billing Portal).
- **Admin visibility:** Admins see which users are subscribed. Preference is to
  fold this into the existing admin user-list page rather than add a new page.

## Known Project Context

- Next.js 14+ App Router, TypeScript strict, Prisma v7 + PostgreSQL, NextAuth
  (Plex PIN auth), TanStack Query, Tailwind, Zod, BullMQ/Redis job queue.
- Existing integrations: Plex, Tautulli, Overseerr, optional Discord/LLM.
- No existing payment/billing dependency (confirmed: no `stripe` in package.json).
- Server Actions preferred for mutations; API routes reserved for
  webhooks/third-party integrations (Stripe webhooks fit here).
