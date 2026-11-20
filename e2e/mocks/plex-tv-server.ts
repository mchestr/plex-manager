import { buildCleanupWorld, CLEANUP_PLEX, plexTvUsersXml, sharedServersXml, type CleanupWorld } from '../helpers/cleanup-fixtures';
import { notFound, startMockServer, text, type MockAnswer, type MockCall, type MockServer } from './request-log';

/**
 * A stand-in for plex.tv (TS 16.4, TS E27). The E2E web server reaches it
 * through `plexTvBaseUrl()`, because `playwright.config.ts` sets
 * `E2E_PLEX_TV_URL` in `webServer.env`. That is why it listens on a fixed
 * port: the web server starts before the global setup.
 *
 * Only the token `e2e-cleanup-plex-token` (`X-Plex-Token`) gets data. Every
 * other token gets 401, as plex.tv answers for `test-token` today. So the
 * specs that need a refused plex.tv keep that state (`e2e/admin/users.spec.ts`,
 * `e2e/admin/inactivity.spec.ts`), and a Plex row that kept the mock's
 * identifier after a spec still gets 401.
 *
 * - `GET /api/users` (XML): `e2e-cleanup-member` and `e2e-cleanup-filtered`
 *   with an accepted share of `e2e-cleanup-machine`, a managed Home user and a
 *   pending invite.
 * - `GET /api/servers/e2e-cleanup-machine/shared_servers` (XML):
 *   `e2e-cleanup-member` with no filter, and `e2e-cleanup-filtered` with
 *   `filterMovies="label!=Untranscodable"`. Any other server is 404.
 *
 * `e2e-cleanup-noshare` is in neither list.
 */

const REFUSED = '<?xml version="1.0" encoding="UTF-8"?>\n<errors>\n  <error code="1001" message="User could not be authenticated" status="401"/>\n</errors>\n';
const xml = (body: string): MockAnswer => text(body, 200, 'application/xml');

function route(world: CleanupWorld, call: MockCall): MockAnswer {
  const header = call.headers['x-plex-token'];
  const token = (Array.isArray(header) ? header[0] : header) ?? call.url.searchParams.get('X-Plex-Token');
  if (token !== CLEANUP_PLEX.token) return text(REFUSED, 401, 'application/xml');
  if (call.method !== 'GET') return notFound();
  if (call.url.pathname === '/api/users') return xml(plexTvUsersXml(world));
  const shares = call.url.pathname.match(/^\/api\/servers\/([^/]+)\/shared_servers$/);
  if (shares && decodeURIComponent(shares[1]) === CLEANUP_PLEX.machineIdentifier) return xml(sharedServersXml(world));
  return notFound();
}

/**
 * Starts the plex.tv mock on 127.0.0.1 at the fixed `port` of
 * `E2E_PLEX_TV_URL`, with the world at the current time.
 */
export async function startMockPlexTv(port: number): Promise<MockServer> {
  let world = buildCleanupWorld(Date.now());
  return startMockServer({
    mock: 'plexTv',
    port,
    handle: (call) => route(world, call),
    reset: (now) => {
      world = buildCleanupWorld(now);
    },
  });
}
