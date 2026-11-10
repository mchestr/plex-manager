import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in for Sonarr, for the problem report specs. The app calls Sonarr
 * from the server, so Playwright's `page.route` cannot intercept it; a spec
 * starts this on a free port and points an active `Sonarr.url` at it.
 *
 * It knows one series ({@link MOCK_SERIES}) and answers the calls Look for
 * the episodes makes: the series by TVDB id, its episodes and episode files
 * from {@link MockSonarr.state}, which a test sets, and `POST
 * /api/v3/command`, which it records in {@link MockSonarr.commands}. Any
 * other path is a 404.
 */

/** The series Sonarr has: TVDB id 95001 is the stub Plex show's id. */
export const MOCK_SERIES = { id: 42, titleSlug: 'harbour-show', tvdbId: 95001 } as const;

export interface MockEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  airDateUtc: string | null;
  monitored: boolean;
  hasFile: boolean;
  episodeFileId?: number;
}

export interface MockSonarr {
  url: string;
  /** What the series has now; a test replaces it. */
  state: { episodes: MockEpisode[]; files: { id: number; relativePath: string }[] };
  /** Every command body posted, oldest first. */
  commands: unknown[];
  close: () => Promise<void>;
}

export async function startMockSonarr(): Promise<MockSonarr> {
  const mock: Omit<MockSonarr, 'url' | 'close'> = { state: { episodes: [], files: [] }, commands: [] };
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://mock');
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.headers['x-api-key'] !== 'e2e-sonarr-key') return json(401, { message: 'Unauthorized' });
    const seriesId = Number(url.searchParams.get('seriesId'));
    if (request.method === 'GET' && url.pathname === '/api/v3/series') {
      return json(200, Number(url.searchParams.get('tvdbId')) === MOCK_SERIES.tvdbId ? [MOCK_SERIES] : []);
    }
    if (request.method === 'GET' && url.pathname === '/api/v3/episode' && seriesId === MOCK_SERIES.id) return json(200, mock.state.episodes);
    if (request.method === 'GET' && url.pathname === '/api/v3/episodefile' && seriesId === MOCK_SERIES.id) return json(200, mock.state.files);
    if (request.method === 'POST' && url.pathname === '/api/v3/command') {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        mock.commands.push(JSON.parse(body || '{}'));
        json(201, { id: mock.commands.length, name: 'EpisodeSearch' });
      });
      return;
    }
    json(404, { message: 'Not found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    ...mock,
    get state() {
      return mock.state;
    },
    set state(next) {
      mock.state = next;
    },
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
