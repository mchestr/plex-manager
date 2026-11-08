import { buildCleanupWorld, CLEANUP_API_KEYS, type CleanupAnswers } from '../helpers/cleanup-fixtures';
import { json, startMockServer, type MockAnswer, type MockCall, type MockServer } from './request-log';

/**
 * A stand-in for Overseerr (Seerr) v1 (TS 16.4), with the users and requests
 * of `buildCleanupWorld(now)`. A spec points an Overseerr row at it with
 * `useCleanupServices()` (`e2e/helpers/seed-cleanup.ts`).
 *
 * - Only the key `e2e-cleanup-overseerr-key` (`X-Api-Key`) gets data. Any
 *   other key gets 403, as Seerr answers.
 * - `GET /api/v1/user?take=&skip=` and `GET /api/v1/request?take=&skip=&sort=added&sortDirection=asc|desc&filter=all`,
 *   paged as Seerr pages them (`pageInfo.page` counts from 1).
 * - `POST /api/v1/settings/jobs/availability-sync/run` (TS 8.11 item 2).
 * - `GET /api/v1/status` and `/api/v1/auth/me`, for a connection test.
 * - Every `DELETE` answers 500 and is recorded, so a spec can assert that
 *   none came (TS 8.9: media cleanup never removes anything in Overseerr).
 */

interface OverseerrState {
  answers: CleanupAnswers['overseerr'];
}

const newState = (now: number): OverseerrState => ({ answers: buildCleanupWorld(now).answers.overseerr });

function paged(call: MockCall, rows: readonly unknown[]): MockAnswer {
  const take = Math.max(1, Number(call.url.searchParams.get('take') ?? 10));
  const skip = Math.max(0, Number(call.url.searchParams.get('skip') ?? 0));
  return json({
    pageInfo: { pages: Math.ceil(rows.length / take), pageSize: take, results: rows.length, page: Math.floor(skip / take) + 1 },
    results: rows.slice(skip, skip + take),
  });
}

function route(state: OverseerrState, call: MockCall): MockAnswer {
  const { method, url } = call;
  if (method === 'DELETE') return json({ message: 'Media cleanup never deletes in Overseerr' }, 500);
  const header = call.headers['x-api-key'];
  if ((Array.isArray(header) ? header[0] : header) !== CLEANUP_API_KEYS.overseerr) {
    return json({ message: 'You do not have permission to access this endpoint' }, 403);
  }
  if (method === 'GET' && url.pathname === '/api/v1/status') return json({ version: '2.7.3', commitTag: 'e2e', updateAvailable: false, commitsBehind: 0 });
  if (method === 'GET' && url.pathname === '/api/v1/auth/me') return json(state.answers.users[0]);
  if (method === 'GET' && url.pathname === '/api/v1/user') return paged(call, state.answers.users);
  if (method === 'GET' && url.pathname === '/api/v1/request') {
    const desc = url.searchParams.get('sortDirection') === 'desc';
    const rows = [...state.answers.requests].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) * (desc ? -1 : 1));
    return paged(call, rows);
  }
  if (method === 'POST' && url.pathname === '/api/v1/settings/jobs/availability-sync/run') {
    return json({ id: 'availability-sync', name: 'Media Availability Sync', type: 'process', interval: 'hours', cronSchedule: '0 0 5 * * *',
      nextExecutionTime: new Date(Date.now() + 3600_000).toISOString(), running: true });
  }
  return json({ message: 'Not Found' }, 404);
}

/** Starts the Overseerr mock on a free port of 127.0.0.1, with the world at the current time. */
export async function startMockOverseerr(): Promise<MockServer> {
  let state = newState(Date.now());
  return startMockServer({
    mock: 'overseerr',
    handle: (call) => route(state, call),
    reset: (now) => {
      state = newState(now);
    },
  });
}
