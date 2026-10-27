# Moving to a new host name

A checklist for moving an install from `old.example.com` to `new.example.com`,
or to a new server. Moving the data itself is a dump and restore
([operations](operations.md#backup)); this page covers the URLs. Take a dump
first, and do the steps in order.

## 1. The URL variables

Set both to the new origin in `.env` ([environment](environment.md#core)):

```env
NEXTAUTH_URL="https://new.example.com"
NEXT_PUBLIC_APP_URL="https://new.example.com"
```

- **Docker image**: restart the container (`docker compose up -d`). The image
  reads both at start: `.dockerignore` keeps `.env` out of the build, so nothing
  is baked in.
- **Bare metal**: run `npm run build` again, then restart. Next inlines
  `NEXT_PUBLIC_*` values at build time, so a restart alone keeps the old URL.
- If you set `PLEX_WRAPPED_BASE_URL` or `DISCORD_PORTAL_URL`, change them too;
  otherwise Discord links follow `NEXT_PUBLIC_APP_URL` (then `NEXTAUTH_URL`).
- Point the reverse proxy and its certificate at the new name
  ([deployment](deployment.md#reverse-proxy)), and check `TRUSTED_PROXY_HOPS` if
  the proxy chain changed (a CDN added or removed).

## 2. The four external registrations

Each of these holds the old URL, and the app cannot change it for you.

1. **Discord OAuth2 redirect.** In the Discord developer portal, your
   application → OAuth2 → Redirects: add
   `https://new.example.com/api/discord/callback`. Remove the old one once
   linking works on the new host.
2. **Discord Linked Roles verification URL.** Same application → General
   Information → Linked Roles Verification URL: set it to the portal URL shown
   in Admin → Settings → Discord, `https://new.example.com/discord/link` by
   default. Without it, members who start linking from Discord land on the old
   host.
3. **Stripe webhook endpoint.** In the Stripe Dashboard → Developers →
   Webhooks, add an endpoint at `https://new.example.com/api/stripe/webhook`
   with every handled event ([Stripe](stripe.md#registering-the-webhook)):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. **The new endpoint's signing secret.** Copy its `whsec_…` secret into Admin →
   Settings → Stripe billing → Edit → Webhook Signing Secret and Save changes, **before**
   you delete the old endpoint. Then send a test event from the Dashboard and
   check that it is delivered; only then delete the old endpoint. Events the old
   endpoint failed to deliver are retried by Stripe, and a resend is safe, since
   the app processes each event id once.

## 3. Service URLs in settings

If your other services moved too, update their public URLs in Admin → Settings:
Overseerr, Jellyfin, Tautulli, Sonarr, Radarr and the Plex web link (each
service's public URL, used for links members click). Plex sign-in needs no
change: the PIN flow's forward URL is computed from each request.

## 4. What members notice

- **Everyone signs in again.** Session cookies are bound to the host, so the
  old host's cookies are not sent to the new one.
- **Old share links stop working** unless the old host redirects. Keep
  `old.example.com` pointing at the proxy and redirect every path:
  ```caddyfile
  old.example.com {
  	redir https://new.example.com{uri} permanent
  }
  ```
  Share links keep their path, so a path-preserving redirect keeps them alive.
- **Discord**: members who linked their account stay linked; links in new bot
  messages use the new host.
- **Bookmarks and installed home-screen apps** point at the old host until the
  member opens the new one.

## 5. Check

- Sign in with Plex on the new host.
- Link a Discord account from `/discord/link`.
- Send a Stripe test webhook and see it delivered with 200.
- `GET https://new.example.com/api/health` answers 200, and monitoring and any
  `/api/metrics` scraper point at the new host.
