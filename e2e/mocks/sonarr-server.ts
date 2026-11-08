import { buildCleanupWorld, CLEANUP_API_KEYS, type CleanupAnswers } from '../helpers/cleanup-fixtures';
import { apiKeyOf, refusesBody } from './radarr-server';
import { empty, json, startMockServer, type MockAnswer, type MockCall, type MockServer } from './request-log';

/**
 * A stand-in for Sonarr v3 (TS 16.4), with the series of
 * `buildCleanupWorld(now)`. A spec points a Sonarr row at it with
 * `useCleanupServices()` (`e2e/helpers/seed-cleanup.ts`).
 *
 * - Only the key `e2e-cleanup-sonarr-key` gets data. Any other key gets 401.
 * - `GET /api/v3/rootfolder`, `/series`, `/tag`, `/importlist`, `/diskspace`,
 *   `/system/status`, `/series/{id}` (404 for an unknown id),
 *   `/episodefile?seriesId=` and `/episode?seriesId=&seasonNumber=`.
 * - `PUT /api/v3/series/{id}` with the whole body: 500 for an unknown id, as
 *   Sonarr answers.
 * - `DELETE /api/v3/series/{id}`: forgets the series, its files and its
 *   episodes. 500 for an unknown id, not 404, as Sonarr answers (TS 8.9 step 6).
 * - `PUT /api/v3/episode/monitor` with `{ episodeIds, monitored }`.
 * - `DELETE /api/v3/episodefile/bulk` with `{ episodeFileIds }`: forgets the
 *   files and updates the statistics. An empty list, or a list of unknown
 *   ids, gets 500, as the controller fails on it.
 * - A request with a body and no `Content-Type: application/json` gets 415.
 */

type Row = Record<string, unknown> & { id: number };
interface SeasonRow {
  seasonNumber: number;
  monitored: boolean;
  statistics: Record<string, unknown> & { episodeFileCount: number; sizeOnDisk: number };
}

interface SonarrState {
  answers: CleanupAnswers['sonarr'];
  series: Row[];
  files: Row[];
  episodes: Row[];
}

function newState(now: number): SonarrState {
  const answers = buildCleanupWorld(now).answers.sonarr;
  return {
    answers,
    series: structuredClone(answers.series) as Row[],
    files: structuredClone(answers.episodefiles) as Row[],
    episodes: structuredClone(answers.episodes) as Row[],
  };
}

const serverError = (message: string) => json({ message, description: message }, 500);
const NOT_FOUND = () => json({ message: 'NotFound', description: 'Series not found' }, 404);

/** The season and series statistics again, from the files that are left. */
function recount(state: SonarrState, series: Row): void {
  const files = state.files.filter((file) => file.seriesId === series.id);
  const seasons = (series.seasons ?? []) as SeasonRow[];
  for (const season of seasons) {
    const own = files.filter((file) => file.seasonNumber === season.seasonNumber);
    season.statistics = { ...season.statistics, episodeFileCount: own.length, sizeOnDisk: own.reduce((total, file) => total + Number(file.size ?? 0), 0) };
  }
  const statistics = (series.statistics ?? {}) as Record<string, unknown>;
  series.statistics = { ...statistics, episodeFileCount: files.length, sizeOnDisk: files.reduce((total, file) => total + Number(file.size ?? 0), 0) };
}

function route(state: SonarrState, call: MockCall): MockAnswer {
  if (apiKeyOf(call) !== CLEANUP_API_KEYS.sonarr) return empty(401);
  const refused = refusesBody(call);
  if (refused) return refused;
  const { method, url } = call;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'api' || parts[1] !== 'v3') return NOT_FOUND();
  const resource = parts.slice(2);
  const id = Number(resource[1]);
  const series = Number.isSafeInteger(id) ? state.series.find((candidate) => candidate.id === id) : undefined;
  const seriesId = Number(url.searchParams.get('seriesId'));

  if (method === 'GET') {
    if (resource.length === 1) {
      switch (resource[0]) {
        case 'rootfolder': return json(state.answers.rootfolder);
        case 'series': return json(state.series);
        case 'tag': return json(state.answers.tags);
        case 'importlist': return json(state.answers.importlists);
        case 'diskspace': return json(state.answers.diskspace);
        case 'episodefile': return json(state.files.filter((file) => file.seriesId === seriesId));
        case 'episode': {
          const season = url.searchParams.get('seasonNumber');
          return json(state.episodes.filter((episode) => episode.seriesId === seriesId && (season === null || episode.seasonNumber === Number(season))));
        }
      }
    }
    if (resource.join('/') === 'system/status') return json({ appName: 'Sonarr', version: '4.0.11.2680', instanceName: 'Sonarr' });
    if (resource.length === 2 && resource[0] === 'series') return series ? json(series) : NOT_FOUND();
  }
  if (method === 'PUT' && resource.length === 2 && resource[0] === 'series') {
    if (!series) return serverError('Sequence contains no elements');
    const body = call.body as { monitored?: unknown; seasons?: unknown } | null;
    if (!body || typeof body.monitored !== 'boolean' || !Array.isArray(body.seasons)) return json({ message: 'Invalid body' }, 400);
    series.monitored = body.monitored;
    const sent = new Map((body.seasons as { seasonNumber?: unknown; monitored?: unknown }[]).map((season) => [season.seasonNumber, season.monitored]));
    for (const season of (series.seasons ?? []) as SeasonRow[]) {
      const monitored = sent.get(season.seasonNumber);
      if (typeof monitored === 'boolean') season.monitored = monitored;
    }
    return json(series, 202);
  }
  if (method === 'DELETE' && resource.length === 2 && resource[0] === 'series') {
    if (!series) return serverError('Sequence contains no elements');
    state.series = state.series.filter((candidate) => candidate !== series);
    state.files = state.files.filter((file) => file.seriesId !== series.id);
    state.episodes = state.episodes.filter((episode) => episode.seriesId !== series.id);
    return empty();
  }
  if (method === 'PUT' && resource.join('/') === 'episode/monitor') {
    const body = call.body as { episodeIds?: unknown; monitored?: unknown } | null;
    if (!body || !Array.isArray(body.episodeIds) || typeof body.monitored !== 'boolean') return json({ message: 'Invalid body' }, 400);
    const ids = new Set(body.episodeIds);
    const changed = state.episodes.filter((episode) => ids.has(episode.id));
    for (const episode of changed) episode.monitored = body.monitored;
    return json(changed, 202);
  }
  if (method === 'DELETE' && resource.join('/') === 'episodefile/bulk') {
    const body = call.body as { episodeFileIds?: unknown } | null;
    const ids = new Set(Array.isArray(body?.episodeFileIds) ? body.episodeFileIds : []);
    const gone = state.files.filter((file) => ids.has(file.id));
    if (gone.length === 0) return serverError('Sequence contains no elements');
    state.files = state.files.filter((file) => !ids.has(file.id));
    for (const episode of state.episodes) {
      if (gone.some((file) => file.id === episode.episodeFileId)) Object.assign(episode, { hasFile: false, episodeFileId: 0 });
    }
    for (const owner of state.series) if (gone.some((file) => file.seriesId === owner.id)) recount(state, owner);
    return empty();
  }
  return NOT_FOUND();
}

/** Starts the Sonarr mock on a free port of 127.0.0.1, with the world at the current time. */
export async function startMockSonarr(): Promise<MockServer> {
  let state = newState(Date.now());
  return startMockServer({
    mock: 'sonarr',
    handle: (call) => route(state, call),
    reset: (now) => {
      state = newState(now);
    },
  });
}
