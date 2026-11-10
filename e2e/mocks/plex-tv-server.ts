import { createServer, type Server } from 'node:http';

import { TEST_USERS } from '../fixtures/auth';

/**
 * A stand-in for plex.tv's share list, so member specs can pass the SEC-21
 * library check without plex.tv. The app reads which sections the server
 * shares with a member from `GET /api/servers/<machineIdentifier>/shared_servers`;
 * with `E2E_TEST_MODE=true`, the web server's `E2E_PLEX_TV_URL` points that
 * read here (`lib/connections/plex-tv-origin.ts`). The web server's
 * environment is fixed when the config loads, before global setup runs, so
 * this listens on a fixed port, `E2E_PLEX_TV_PORT` (default 2527).
 *
 * Every server answers with the shares in {@link MOCK_SHARED_SECTIONS}, in
 * plex.tv's XML. Any other path is a 404.
 */

/** Section keys shared with each Plex account. The regular member gets section 1, never section 2. */
export const MOCK_SHARED_SECTIONS: Readonly<Record<string, readonly string[]>> = {
  [TEST_USERS.REGULAR.plexUserId]: ['1'],
};

/** The fixed port the web server's `E2E_PLEX_TV_URL` names. */
export const plexTvMockPort = () => Number(process.env.E2E_PLEX_TV_PORT || 2527);

const SECTIONS = [
  { key: '1', title: 'Movies', type: 'movie' },
  { key: '2', title: 'TV Shows', type: 'show' },
];

function sharedServersXml(machineIdentifier: string): string {
  const servers = Object.entries(MOCK_SHARED_SECTIONS).map(([userId, keys], index) => {
    const sections = SECTIONS.map(
      (section) =>
        `<Section id="${5000 + Number(section.key)}" key="${section.key}" title="${section.title}" type="${section.type}" shared="${keys.includes(section.key) ? 1 : 0}"/>`
    ).join('');
    return `<SharedServer id="${9000 + index}" userID="${userId}" name="E2E Server" allLibraries="0" filterMovies="" filterTelevision="">${sections}</SharedServer>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><MediaContainer machineIdentifier="${machineIdentifier}" size="${servers.length}">${servers.join('')}</MediaContainer>`;
}

/** Starts the mock on `port` on 127.0.0.1. */
export async function startMockPlexTv(port = plexTvMockPort()): Promise<Server> {
  const server = createServer((req, res) => {
    const match = /^\/api\/servers\/([^/]+)\/shared_servers$/.exec(new URL(req.url ?? '/', 'http://mock').pathname);
    if (req.method !== 'GET' || !match) {
      res.writeHead(404);
      res.end();
      return;
    }
    let machineIdentifier: string;
    try {
      machineIdentifier = decodeURIComponent(match[1]);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(sharedServersXml(machineIdentifier));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
