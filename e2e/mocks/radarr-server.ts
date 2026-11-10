import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A stand-in for Radarr, for the problem report specs. The app calls Radarr
 * from the server, so Playwright's `page.route` cannot intercept it; a spec
 * starts this on a free port and points an active `Radarr.url` at it.
 *
 * It knows one movie ({@link MOCK_MOVIE}) and answers the calls Look for a
 * better copy makes: the movie by TMDB id and by id with its file (from
 * {@link MockRadarr.file}, which a test sets), its quality profile, an empty
 * queue and history, and `POST /api/v3/command`, which it records in
 * {@link MockRadarr.commands}. Every command it is asked about is still
 * running, so a run waits. Any other path is a 404.
 */

/** The movie Radarr has: TMDB id 95101 is the stub Plex movie's id. */
export const MOCK_MOVIE = { id: 7, titleSlug: 'harbour-heist-2024', tmdbId: 95101, qualityProfileId: 4 } as const;

export interface MockMovieFile {
  id: number;
  relativePath: string;
  size: number;
  qualityCutoffNotMet: boolean;
  customFormatScore: number;
}

export interface MockRadarr {
  url: string;
  /** The movie's file now; a test replaces it. */
  file: MockMovieFile;
  /** Every command body posted, oldest first. */
  commands: unknown[];
  close: () => Promise<void>;
}

export async function startMockRadarr(movieFolder: string): Promise<MockRadarr> {
  const mock: Omit<MockRadarr, 'url' | 'close'> = {
    file: { id: 70, relativePath: 'movie.mkv', size: 1, qualityCutoffNotMet: false, customFormatScore: 0 },
    commands: [],
  };
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://mock');
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(body));
    };
    if (request.headers['x-api-key'] !== 'e2e-radarr-key') return json(401, { message: 'Unauthorized' });
    const movieId = Number(url.searchParams.get('movieId'));
    if (request.method === 'GET' && url.pathname === '/api/v3/movie') {
      return json(200, Number(url.searchParams.get('tmdbId')) === MOCK_MOVIE.tmdbId ? [MOCK_MOVIE] : []);
    }
    if (request.method === 'GET' && url.pathname === `/api/v3/movie/${MOCK_MOVIE.id}`) {
      return json(200, { ...MOCK_MOVIE, monitored: true, path: movieFolder, movieFile: { ...mock.file, path: `${movieFolder}/${mock.file.relativePath}` } });
    }
    if (request.method === 'GET' && url.pathname === `/api/v3/qualityprofile/${MOCK_MOVIE.qualityProfileId}`) {
      return json(200, { id: MOCK_MOVIE.qualityProfileId, name: 'HD-1080p', upgradeAllowed: true, cutoffFormatScore: 0 });
    }
    if (request.method === 'GET' && (url.pathname === '/api/v3/queue/details' || url.pathname === '/api/v3/history/movie') && movieId === MOCK_MOVIE.id) {
      return json(200, []);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/v3/command/')) {
      return json(200, { id: Number(url.pathname.split('/').at(-1)), name: 'MoviesSearch', status: 'started' });
    }
    if (request.method === 'POST' && url.pathname === '/api/v3/command') {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        mock.commands.push(JSON.parse(body || '{}'));
        json(201, { id: mock.commands.length, name: 'MoviesSearch', status: 'queued' });
      });
      return;
    }
    json(404, { message: 'Not found' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    ...mock,
    get file() {
      return mock.file;
    },
    set file(next) {
      mock.file = next;
    },
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
