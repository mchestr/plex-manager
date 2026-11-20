import { buildCleanupWorld, CLEANUP_API_KEYS, type CleanupAnswers } from '../helpers/cleanup-fixtures';
import { empty, json, startMockServer, type MockAnswer, type MockCall, type MockServer } from './request-log';

/**
 * A stand-in for Radarr v3 (TS 16.4), with the movies of
 * `buildCleanupWorld(now)`. A spec points a Radarr row at it with
 * `useCleanupServices()` (`e2e/helpers/seed-cleanup.ts`).
 *
 * - Only the key `e2e-cleanup-radarr-key` (`X-Api-Key`, or `apikey` in the
 *   query) gets data. Any other key gets 401, which the act step reads as
 *   `arrRefused`.
 * - `GET /api/v3/rootfolder`, `/movie`, `/tag`, `/importlist`, `/diskspace`,
 *   `/system/status`.
 * - `GET /api/v3/movie/{id}`: the record, or 404 for an unknown id.
 * - `PUT /api/v3/movie/editor` with `{ movieIds, monitored }`.
 * - `DELETE /api/v3/movie/{id}`: forgets the movie. 404 for an unknown id.
 * - `DELETE /api/v3/moviefile/{id}`: forgets the file. 404 for an unknown id.
 * - A request with a body and no `Content-Type: application/json` gets 415,
 *   as Radarr's `[Consumes("application/json")]` routes answer.
 */

type Movie = Record<string, unknown> & { id: number };

interface RadarrState {
  answers: CleanupAnswers['radarr'];
  movies: Movie[];
}

function newState(now: number): RadarrState {
  const answers = buildCleanupWorld(now).answers.radarr;
  return { answers, movies: structuredClone(answers.movies) as Movie[] };
}

const NOT_FOUND = () => json({ message: 'NotFound', description: 'Movie not found' }, 404);

/** Whether a request with a body says it is JSON (TS 7.2.1 item 7). */
export function refusesBody(call: MockCall): MockAnswer | null {
  if (call.text === '') return null;
  return call.contentType?.split(';')[0].trim() === 'application/json' ? null : json({ message: 'Unsupported Media Type' }, 415);
}

/** The arr API key of a request: the `X-Api-Key` header, else the `apikey` query parameter. */
export function apiKeyOf(call: MockCall): string | null {
  const header = call.headers['x-api-key'];
  return (Array.isArray(header) ? header[0] : header) ?? call.url.searchParams.get('apikey');
}

function route(state: RadarrState, call: MockCall): MockAnswer {
  if (apiKeyOf(call) !== CLEANUP_API_KEYS.radarr) return empty(401);
  const refused = refusesBody(call);
  if (refused) return refused;
  const { method, url } = call;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'v3') return NOT_FOUND();
  const resource = parts.slice(2);
  const id = Number(resource[1]);
  const movie = Number.isSafeInteger(id) ? state.movies.find((candidate) => candidate.id === id) : undefined;

  if (method === 'GET') {
    if (resource.length === 1) {
      switch (resource[0]) {
        case 'rootfolder': return json(state.answers.rootfolder);
        case 'movie': return json(state.movies);
        case 'tag': return json(state.answers.tags);
        case 'importlist': return json(state.answers.importlists);
        case 'diskspace': return json(state.answers.diskspace);
      }
    }
    if (resource.join('/') === 'system/status') return json({ appName: 'Radarr', version: '5.14.0.9383', instanceName: 'Radarr' });
    if (resource.length === 2 && resource[0] === 'movie') return movie ? json(movie) : NOT_FOUND();
  }
  if (method === 'PUT' && resource.join('/') === 'movie/editor') {
    const body = call.body as { movieIds?: unknown; monitored?: unknown } | null;
    if (!body || !Array.isArray(body.movieIds) || typeof body.monitored !== 'boolean') return json({ message: 'Invalid body' }, 400);
    const ids = new Set(body.movieIds);
    const changed = state.movies.filter((candidate) => ids.has(candidate.id));
    for (const candidate of changed) candidate.monitored = body.monitored;
    return json(changed, 202);
  }
  if (method === 'DELETE' && resource.length === 2 && resource[0] === 'movie') {
    if (!movie) return NOT_FOUND();
    state.movies = state.movies.filter((candidate) => candidate !== movie);
    return empty();
  }
  if (method === 'DELETE' && resource.length === 2 && resource[0] === 'moviefile') {
    const owner = state.movies.find((candidate) => candidate.movieFileId === id);
    if (!owner) return json({ message: 'NotFound', description: 'Movie file not found' }, 404);
    Object.assign(owner, { hasFile: false, movieFileId: 0, sizeOnDisk: 0, statistics: { movieFileCount: 0, sizeOnDisk: 0, releaseGroups: [] } });
    return empty();
  }
  return NOT_FOUND();
}

/** Starts the Radarr mock on a free port of 127.0.0.1, with the world at the current time. */
export async function startMockRadarr(): Promise<MockServer> {
  let state = newState(Date.now());
  return startMockServer({
    mock: 'radarr',
    handle: (call) => route(state, call),
    reset: (now) => {
      state = newState(now);
    },
  });
}
