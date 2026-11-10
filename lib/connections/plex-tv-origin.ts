/**
 * Where plex.tv's share list is read from.
 *
 * Always `https://plex.tv`, except in the Playwright suite: there
 * `playwright.config.ts` starts the web server with `E2E_TEST_MODE=true` and
 * `E2E_PLEX_TV_URL` naming a local mock (`e2e/mocks/plex-tv-server.ts`), so
 * member specs can pass the SEC-21 library check without plex.tv. The mock is
 * used only at a loopback `http://` address, so a stray variable can't send
 * the owner's token to another host. A deployment sets neither variable, and
 * nothing a member or an admin enters reaches this.
 *
 * @module
 */

const PLEX_TV = "https://plex.tv"
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"])

/**
 * The origin for plex.tv's share list calls.
 *
 * @example
 * ```ts
 * plexTvOrigin({})                                                                   // "https://plex.tv"
 * plexTvOrigin({ E2E_TEST_MODE: "true", E2E_PLEX_TV_URL: "http://127.0.0.1:2527" })   // "http://127.0.0.1:2527"
 * plexTvOrigin({ E2E_TEST_MODE: "true", E2E_PLEX_TV_URL: "http://plex.example.com" }) // "https://plex.tv"
 * ```
 */
export function plexTvOrigin(env: Record<string, string | undefined> = process.env): string {
  if (env.E2E_TEST_MODE !== "true" || !env.E2E_PLEX_TV_URL || !URL.canParse(env.E2E_PLEX_TV_URL)) return PLEX_TV
  const url = new URL(env.E2E_PLEX_TV_URL)
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname) ? url.origin : PLEX_TV
}
