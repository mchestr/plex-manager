import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in for Radarr, for the problem report specs. The app calls Radarr
 * from the server, so Playwright's `page.route` cannot intercept it; a spec
 * starts this on a free port and points an active `Radarr.url` at it.
 *
 * It knows one movie ({@link MOCK_MOVIE}) and answers the calls the fixes
 * make: the movie by TMDB id, in the whole library and by id with its file (from
 * {@link MockRadarr.file}, which a test sets, or none), its quality profile,
 * an empty queue, the history and the releases a test sets, and the
 * blocklist. It records what the app asks of it: commands
 * (`POST /api/v3/command`, each still running when asked about, so a run
 * waits), grabs (`POST /api/v3/release`, which imports a new file at once),
 * grabs marked failed (which blocklists their release), deleted files and
 * monitoring edits. Any other path is a 404.
 */

/** The movie Radarr has: TMDB id 95101 is the stub Plex movie's id. */
export const MOCK_MOVIE = { id: 7, titleSlug: 'harbour-heist-2024', tmdbId: 95101, imdbId: 'tt9510100', title: 'Harbour Heist', year: 2024, qualityProfileId: 4 } as const;

export interface MockMovieFile {
  id: number;
  relativePath: string;
  size: number;
  qualityCutoffNotMet: boolean;
  customFormatScore: number;
  sceneName?: string;
  quality?: { quality: { id: number; name: string }; revision: { version: number; real: number } };
  languages?: { id: number; name: string }[];
}

/** A history record as Radarr sends it. */
export interface MockHistoryRecord {
  id: number;
  eventType: string;
  date: string;
  sourceTitle: string;
  downloadId: string;
  data: Record<string, string>;
}

export interface MockRadarr {
  url: string;
  /** The movie's file now, or none; a test replaces it, and a grab imports a new one. */
  file: MockMovieFile | null;
  /** The movie's history, newest last. */
  history: MockHistoryRecord[];
  /** What an interactive search returns. */
  releases: unknown[];
  /** Whether a recycle bin is set in media management. */
  recycleBin: boolean;
  /** Every command body posted, oldest first. */
  commands: unknown[];
  /** Every release grabbed: its guid and indexer. */
  grabs: unknown[];
  /** The history ids marked failed. */
  failed: number[];
  /** The release titles blocklisted. */
  blocklist: string[];
  /** The ids of the files deleted. */
  deleted: number[];
  /** Every movie editor body put. */
  edits: unknown[];
  close: () => Promise<void>;
}

const readBody = (request: IncomingMessage) =>
  new Promise<unknown>((resolve) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => resolve(JSON.parse(body || '{}')));
  });

/** HD-1080p: WEBDL-720p, then Bluray-1080p. */
const PROFILE_ITEMS = [{ quality: { id: 5, name: 'WEBDL-720p' }, allowed: true }, { quality: { id: 7, name: 'Bluray-1080p' }, allowed: true }];

export async function startMockRadarr(movieFolder: string): Promise<MockRadarr> {
  // The server reads this object on every request, so a test changes what it answers by setting its fields
  const mock: MockRadarr = {
    url: '',
    close: async () => undefined,
    file: { id: 70, relativePath: 'movie.mkv', size: 1, qualityCutoffNotMet: false, customFormatScore: 0 },
    history: [],
    releases: [],
    recycleBin: true,
    commands: [],
    grabs: [],
    failed: [],
    blocklist: [],
    deleted: [],
    edits: [],
  };
  const server: Server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://mock');
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.headers['x-api-key'] !== 'e2e-radarr-key') return json(401, { message: 'Unauthorized' });
    const movieId = Number(url.searchParams.get('movieId'));
    const route = `${request.method} ${url.pathname}`;
    const movie = () => ({ ...MOCK_MOVIE, monitored: true, path: movieFolder, movieFile: mock.file && { ...mock.file, path: `${movieFolder}/${mock.file.relativePath}` } });
    if (route === 'GET /api/v3/movie') {
      if (!url.searchParams.has('tmdbId')) return json(200, [movie()]);
      return json(200, Number(url.searchParams.get('tmdbId')) === MOCK_MOVIE.tmdbId ? [MOCK_MOVIE] : []);
    }
    if (route === `GET /api/v3/movie/${MOCK_MOVIE.id}`) return json(200, movie());
    if (route === `GET /api/v3/qualityprofile/${MOCK_MOVIE.qualityProfileId}`) {
      return json(200, { id: MOCK_MOVIE.qualityProfileId, name: 'HD-1080p', upgradeAllowed: true, cutoffFormatScore: 0, items: PROFILE_ITEMS });
    }
    if (route === 'GET /api/v3/queue/details' && movieId === MOCK_MOVIE.id) return json(200, []);
    if (route === 'GET /api/v3/history/movie' && movieId === MOCK_MOVIE.id) return json(200, mock.history);
    if (route === 'GET /api/v3/release' && movieId === MOCK_MOVIE.id) return json(200, mock.releases);
    if (route === 'GET /api/v3/blocklist/movie' && movieId === MOCK_MOVIE.id) return json(200, mock.blocklist.map((sourceTitle, index) => ({ id: index + 1, movieId, sourceTitle })));
    if (route === 'GET /api/v3/config/mediamanagement') return json(200, { recycleBin: mock.recycleBin ? '/recycle' : '' });
    if (request.method === 'GET' && url.pathname.startsWith('/api/v3/command/')) {
      return json(200, { id: Number(url.pathname.split('/').at(-1)), name: 'MoviesSearch', status: 'started' });
    }
    if (route === 'POST /api/v3/command') {
      mock.commands.push(await readBody(request));
      return json(201, { id: mock.commands.length, name: 'MoviesSearch', status: 'queued' });
    }
    if (route === 'POST /api/v3/release') {
      mock.grabs.push(await readBody(request));
      if (mock.file) mock.file = { ...mock.file, id: mock.file.id + 1 };
      return json(200, {});
    }
    if (request.method === 'POST' && url.pathname.startsWith('/api/v3/history/failed/')) {
      const id = Number(url.pathname.split('/').at(-1));
      mock.failed.push(id);
      const grab = mock.history.find((record) => record.id === id);
      if (grab) mock.blocklist.push(grab.sourceTitle);
      return json(200, {});
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/api/v3/moviefile/')) {
      mock.deleted.push(Number(url.pathname.split('/').at(-1)));
      mock.file = null;
      return json(200, {});
    }
    if (route === 'PUT /api/v3/movie/editor') {
      mock.edits.push(await readBody(request));
      return json(202, {});
    }
    json(404, { message: 'Not found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  mock.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  mock.close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return mock;
}
