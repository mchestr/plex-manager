import { TEST_USERS } from '../fixtures/auth';
import { buildCleanupWorld, CLEANUP_PLEX, plexTvUsersXml, sharedServersXml, type CleanupWorld } from '../helpers/cleanup-fixtures';
import { notFound, startMockServer, text, type MockAnswer, type MockCall, type MockServer } from './request-log';

/**
 * A stand-in for plex.tv (TS 16.4, TS E27). The E2E web server reaches it
 * through `plexTvBaseUrl()`, because `playwright.config.ts` sets
 * `E2E_PLEX_TV_URL` in `webServer.env`. That is why it listens on a fixed
 * port: the web server starts before the global setup.
 *
 * Only the token `e2e-cleanup-plex-token` (`X-Plex-Token`) gets the cleanup
 * world's data. Every other token gets 401 for it, as plex.tv answers for
 * `test-token` today. So the specs that need a refused plex.tv keep that state
 * (`e2e/admin/users.spec.ts`, `e2e/admin/inactivity.spec.ts`), and a Plex row
 * that kept the mock's identifier after a spec still gets 401.
 *
 * - `GET /api/users` (XML): `e2e-cleanup-member` and `e2e-cleanup-filtered`
 *   with an accepted share of `e2e-cleanup-machine`, a managed Home user and a
 *   pending invite.
 * - `GET /api/servers/e2e-cleanup-machine/shared_servers` (XML):
 *   `e2e-cleanup-member` with no filter, and `e2e-cleanup-filtered` with
 *   `filterMovies="label!=Untranscodable"`.
 *
 * `e2e-cleanup-noshare` is in neither list.
 *
 * The share list of any other server, whatever the token, is
 * {@link MOCK_SHARED_SECTIONS}: the member specs' stub Plex servers
 * (`e2e/poster-library-access.spec.ts`) pass the SEC-21 library check with it.
 */

/** Section keys shared with each Plex account on a server other than the cleanup world's. The regular member gets section 1, never section 2. */
export const MOCK_SHARED_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  [TEST_USERS.REGULAR.plexUserId]: ['1'],
};

const MEMBER_SECTIONS = [
  { key: '1', title: 'Movies', type: 'movie' },
  { key: '2', title: 'TV Shows', type: 'show' },
];

/** {@link MOCK_SHARED_SECTIONS} as plex.tv's XML, for `machineIdentifier`. */
function memberSharesXml(machineIdentifier: string): string {
  const servers = Object.entries(MOCK_SHARED_SECTIONS).map(([userId, keys], index) => {
    const sections = MEMBER_SECTIONS.map(
      (section) =>
        `<Section id="${5000 + Number(section.key)}" key="${section.key}" title="${section.title}" type="${section.type}" shared="${keys.includes(section.key) ? 1 : 0}"/>`
    ).join('');
    return `<SharedServer id="${9000 + index}" userID="${userId}" name="E2E Server" allLibraries="0" filterMovies="" filterTelevision="">${sections}</SharedServer>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><MediaContainer machineIdentifier="${machineIdentifier}" size="${servers.length}">${servers.join('')}</MediaContainer>`;
}

const REFUSED = '<?xml version="1.0" encoding="UTF-8"?>\n<errors>\n  <error code="1001" message="User could not be authenticated" status="401"/>\n</errors>\n';
const xml = (body: string): MockAnswer => text(body, 200, 'application/xml');

function route(world: CleanupWorld, call: MockCall): MockAnswer {
  const shares = call.url.pathname.match(/^\/api\/servers\/([^/]+)\/shared_servers$/);
  const machine = shares ? decodeURIComponent(shares[1]) : null;
  if (call.method === 'GET' && machine !== null && machine !== CLEANUP_PLEX.machineIdentifier) return xml(memberSharesXml(machine));
  const header = call.headers['x-plex-token'];
  const token = (Array.isArray(header) ? header[0] : header) ?? call.url.searchParams.get('X-Plex-Token');
  if (token !== CLEANUP_PLEX.token) return text(REFUSED, 401, 'application/xml');
  if (call.method !== 'GET') return notFound();
  if (call.url.pathname === '/api/users') return xml(plexTvUsersXml(world));
  if (machine === CLEANUP_PLEX.machineIdentifier) return xml(sharedServersXml(world));
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
