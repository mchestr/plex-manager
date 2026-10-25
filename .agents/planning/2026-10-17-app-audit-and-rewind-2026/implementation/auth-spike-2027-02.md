# Auth spike: Better Auth vs next-auth v4 (P11.23, SEC-07)

Run on 2026-10-25, early. The plan's window is 2027-02-22 to 2027-02-24, and the calendar note does not hold the build back. This answers decision 27 in Appendix C.

- **Spike branch:** `spike/better-auth` at `a2e60fe`, built from the P11.23 step commit `e8f5aab`. It is never merged. Its `spike/README.md` lists every change.
- **Playwright result:** `spike/playwright-run.txt` on that branch: **50 passed, 0 failed**. The run used `next dev`, chromium, and the `plex_manager_p1123_test` database. Plex was the mocked plex.tv from P4.8's tests: the connection-test bypass plus a routed `app.plex.tv`.
- **Packages on the day:** `better-auth` 1.7.12 (MIT; 1.7.13 is from today), and `next-auth` 4.24.15 (latest). Auth.js v5 is still `next-auth@5.0.0-beta.32` (2026-07-20) and has never had a stable release.

## Decision

**No-go for now.** Plex Manager stays on next-auth 4.24.x, plus P4.7's `sessionVersion` check. **Revisit on 2027-08-02**, before the 2027 Rewind work starts. Revisit sooner if any of these happens:

- next-auth 4 stops shipping security releases, or announces an end-of-life date.
- A finding needs a session to end on the next request rather than within 5 minutes.
- Auth.js v5 or next-auth 4 picks up an advisory that cannot be fixed on 4.24.x.

Why no-go, although every technical question below is yes or partly:

- **The migration buys little today.** next-auth 4.24.x still gets security releases: 4.24.14 on 2026-04-14 and 4.24.15 on 2026-07-20. The 4.24.15 fixes include GHSA-xmf8-cvqr-rfgj, a `getToken()` crash on a malformed Bearer header. `proxy.ts` does call `getToken` now (P4.5), and 4.24.15 is already installed. P4.7 already ends a session within the 5-minute recheck. Database sessions would make that immediate (shown below), and that is the main real gain.
- **The cost is high.** Every member has to sign in again, about 7 to 9 engineer-days (see "Effort"), and the rework of about 112 Jest files that mock next-auth. It lands in the months after the Rewind season, when members come back to view their Rewind.
- **The risks are new.**
  - Better Auth's advisory rate is high, though most of it is in plugins we would not use.
  - Each page load would need two database reads (the proxy, then the render) where it needs none today.
  - The relaxed user schema relies on how plugin schemas merge.

## Findings

| Question | Answer | Evidence on `spike/better-auth` |
|---|---|---|
| Plex PIN sign-in as a plugin that keeps P4.8's browser binding (signed PIN cookie, token read on the server) | **Yes** | `lib/better-auth/plex-plugin.ts`: `POST /api/ba/plex/sign-in` has no body. It reads `pm-plex-pin` from the request's cookies and calls next-auth's own Plex `authorize` unchanged, which runs `readPin` on the server, the invite redemption, the access check and the owner promotion. The `auth:plex` per-IP limit runs first. Playwright: P4.8's three PIN tests pass unchanged (`public-flows.spec.ts:10`, `:28`, `:71`). `spike-better-auth.spec.ts:18` signs in the whole way through the plugin and checks that the response carries no token. `:59` shows that a browser without the PIN cookie gets `401 plex_pin_expired`. |
| Jellyfin username and password as a credentials plugin with P0.5's linking rules and P0.10's limits | **Yes** | `lib/better-auth/jellyfin-plugin.ts` has a Zod body and the `auth:jellyfin:ip` limit, then calls next-auth's Jellyfin `authorize` unchanged: the per-username limit with its refund, the "Allow Jellyfin sign-in" check, and matching by Jellyfin user id only. Playwright: `jellyfin-member.spec.ts:51` signs an invited Jellyfin member in through the form and the plugin. That member has no email. All of `jellyfin-invite.spec.ts` passes. |
| Database sessions on Prisma 7 with the driver adapter, the generated client and the `ENCRYPTED_FIELDS` extension | **Partly** | `lib/better-auth/server.ts`: `prismaAdapter(prisma)` on the lazily built extended client works (P11.22's Proxy, `@prisma/adapter-pg`, `@/lib/generated/prisma/client`). Sessions are written to `AuthSession`, and `spike-better-auth.spec.ts:18` reads the row back. Two caveats. (1) Better Auth's core user schema requires `name` and a unique `email`, and makes `emailVerified` a boolean. Our `User` has a nullable name and email (Jellyfin members; SEC-08's retry) and a DateTime `emailVerified` that `lib/invites/plex-redemption.ts` writes. `lib/better-auth/user-schema.ts` relaxes all three through a plugin schema, which works for reads and sessions, but Better Auth's own user-creation endpoints would not be safe to turn on. (2) The schema has no migration here (it used `prisma db push`). A real one would add three tables. `AuthSession` stores `ipAddress` and `userAgent`, so the change also needs a `docs/privacy.md` inventory row and a retention rule for expired sessions (P11.13, P11.14). |
| Revocation that could replace P4.7's `sessionVersion`, so an unshare ends the session on the next request | **Yes** | `lib/session-revocation.ts` deletes the user's `AuthSession` rows inside `endUserSessions`. The cookie cache is off, so the next `getSession` finds nothing. `spike-better-auth.spec.ts:18` deletes the row, and the next `/api/ba/get-session` is `null` while `/admin` shows "Sign in to continue". `admin/remove-member.spec.ts:40` and `jellyfin-member.spec.ts:95` (turning access off signs the member out) pass. Today a session can last up to 5 minutes after revocation; with database sessions it ends on the next request. The `sessionVersion` column could go after one release. |
| Works with Next 16's proxy, Server Actions, P11.19's Cache Components and P11.20's nonce CSP | **Partly** | **Proxy:** `proxy.ts` calls `getAuth().api.getSession({ headers })` on Node, and `accessLevel` moves from a JWT claim to a session column. **Server Actions:** `getSession()` reads `headers()`, and admin actions run through it (`remove-member.spec.ts` uses `adminAction`). **Cache Components:** `getSession` stays outside `'use cache'` and is per request, as it is today. Every page in the run renders. The run's `generateViewport` and "uncached data" dev warnings come from `lib/design/theme.ts` and are the same as on the step branch. **CSP:** P11.20 is not on this branch, so the nonce CSP is untested. Better Auth adds no inline script and no client bundle (the spike posts with `fetch`; `better-auth/react` is not needed), so nothing in it should conflict. |
| Migration path: every member signs in once; the admin bootstrap; P1.6's E2E session fixture | **Partly** | **Re-sign-in:** the JWT cookie cannot be turned into a session row as it stands, so every member signs in once. An untested option is for the proxy, during one release, to decode a still-valid next-auth JWT with `NEXTAUTH_SECRET`, check `sv` against `sessionVersion`, and exchange it for a database session. **Bootstrap:** unchanged. The owner is the admin because `authorize` compares `adminPlexUserId`, and the spike signs the seeded owner in and reaches `/admin`. **E2E fixture:** `e2e/fixtures/session.ts` now inserts an `AuthSession` row and sets the signed `better-auth.session_token` cookie (`token.HMAC-SHA256`, URL-encoded). `adminPage` and `regularUserPage` work unchanged, and all 17 `admin-protection.spec.ts` tests pass. |
| Package health: release cadence, open advisories, licence | **Partly** | **Licence:** MIT. **Cadence:** a minor release every 1 to 5 months (1.5.0 2026-03-01, 1.6.0 2026-04-06, 1.7.0 2026-08-18) and a patch most weeks (13 patches of 1.7 by 2026-10-25), with 1.8.0 in beta. **Advisories:** the GitHub advisory list runs to four or more pages, all ten on the first page from 2026. These include a Critical one in core (GHSA-965c-763c-88jm, "OAuth state can be used as a Magic Link", 2026-09-30); the rest are in SSO, SCIM, OAuth proxy, device flow and Stripe, none of which we would use. `npm audit` reports nothing for 1.7.12. Telemetry ships as a dependency and the spike turns it off (`telemetry: { enabled: false }`). npm put a second `@better-auth/core` under `better-auth/node_modules`. |

### The alternatives on the day

| Option | Status | Effort | Revocation |
|---|---|---|---|
| Stay on next-auth 4.24.x + P4.7 | Gets security releases (2 in 2026). Maintained by the Better Auth team since 2025-09-22, which promised security patches and urgent fixes for existing users (better-auth.com/blog/authjs-joins-better-auth) | None | Within 5 minutes (JWT recheck) |
| Auth.js v5 (`next-auth@5`) | Still `5.0.0-beta.32`, never stable; its maintainers recommend Better Auth for new projects | Similar to Better Auth (new config, new session API), on a beta | JWT or database sessions |
| Better Auth 1.7 | Active; many advisories, mostly in plugins | About 7 to 9 days (below) | On the next request |

## Files a migration would touch

- **Core:**
  - `lib/auth.ts`: its two `authorize` functions become plain exports, and `authOptions` goes.
  - New `lib/better-auth/*` files.
  - `types/next-auth.d.ts` is deleted; the Better Auth types are inferred.
  - `app/api/auth/[...nextauth]/route.ts` is replaced by `app/api/ba/[...all]/route.ts`, and the per-IP limits move into the plugins.
- **Session reads:**
  - `lib/data/session.ts`. The spike keeps next-auth's `Session` shape, so its 26 callers do not change.
  - `proxy.ts`
  - `lib/actions/define-action.ts`, `lib/actions/route.ts`, `lib/admin.ts`, `lib/access.ts` and `lib/security/api-helpers.ts` (they import next-auth types).
- **Revocation:** `lib/session-revocation.ts` and its callers' tests. The `User.sessionVersion` column is dropped one release later.
- **Client:**
  - Sign-in: `app/auth/callback/plex/callback-client.tsx` and `components/auth/jellyfin-sign-in-button.tsx`.
  - Sign-out: `components/shell/use-sign-out.ts`, `app/auth/denied/denied-sign-out.tsx`, `components/subscribe/subscribe-sign-out.tsx` and `components/shell/public-sign-out.tsx`, which still call next-auth's `signOut` on the spike.
  - `lib/providers.tsx` (`SessionProvider`), `lib/plex-sign-in-codes.ts` and `lib/security/rate-limit-messages.ts`.
- **Data:** a migration for `AuthSession`, `AuthAccount` and `AuthVerification`; the `emailVerified` type; `docs/privacy.md`; a retention rule for expired sessions; `lib/members/erase.ts` (rows cascade).
- **Config and docs:** the `NEXTAUTH_URL` and `NEXTAUTH_SECRET` names in `lib/env.ts` (keep them, or rename with an upgrade note), `docs/environment.md`, a CHANGELOG upgrade note ("everyone signs in once"), and the auth section of CLAUDE.md.
- **Tests:**
  - About 112 Jest files that import or mock `next-auth`.
  - `e2e/fixtures/session.ts` and `e2e/fixtures/auth.ts`.
  - The JWT-minting cases in `e2e/jellyfin-member.spec.ts` and `__tests__/lib/auth-cookies.test.ts`.

## Effort

About 7 to 9 engineer-days, size L:

| Work | Days |
|---|---|
| Plugins, server and route | 1 |
| Session reads, proxy and revocation | 1 |
| Client sign-in and sign-out | 1 |
| Migration, privacy and retention | 1 |
| Jest rework | 2 to 3 |
| E2E fixtures and specs | 1 |
| Rollout, docs and a release of overlap before `sessionVersion` goes | 0.5 to 1 |

## Risks

- **Load:** each page load reads the session twice, once in the proxy and once in the render, because React `cache()` does not span both. Today a page load needs none. Turning on Better Auth's cookie cache brings back a revocation window.
- **Security exposure:** Better Auth's advisory rate is high, so keep to core and our own two plugins, and follow its releases weekly.
- **Schema coupling:** the relaxed user schema depends on how plugin schemas merge in `@better-auth/core`, and a minor release could change that.
- **Members:** everyone signs in again unless the JWT bridge is built. That bridge is untested.
- **Rollback:** going back to next-auth after the switch would mean a second forced re-sign-in.
