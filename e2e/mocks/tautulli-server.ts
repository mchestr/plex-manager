import { buildCleanupWorld, type WorldPlay } from '../helpers/cleanup-fixtures';
import { dayKey, normalizeTimeZone } from '../../lib/utils/zoned-time';
import { json, startMockServer, type MockServer } from './request-log';

/**
 * A stand-in for Tautulli. The app calls Tautulli from the server, so
 * Playwright's `page.route` cannot intercept the request; global setup starts
 * this on a free port and exports its URL as `E2E_TAUTULLI_URL`, and a spec
 * points an active `Tautulli.url` at it.
 *
 * Four commands answer, in Tautulli's `response` envelope; any other is an error:
 *
 * - `get_user_watch_time_stats`, for the affiliate specs (Make reads the
 *   member's watch time live): every user has {@link MOCK_WATCH_HOURS} all
 *   time and 10 hours in the last 30 days.
 * - `get_users_table`, for the inactive members spec (the daily last seen
 *   read): the users in {@link MOCK_USERS_TABLE}, paged by `start` and
 *   `length` as Tautulli's DataTables call is.
 * - `get_history`. With `length=1` (the inactivity read's oldest play, and a
 *   member's first watch): one row, the oldest of {@link MOCK_OLDEST_PLAY}, as
 *   before. Any other call pages {@link MOCK_CLEANUP_HISTORY}, the history of
 *   `buildCleanupWorld(now)` for media cleanup (TS 16.4). It applies `after`,
 *   `before`, `rating_key`, `parent_rating_key`, `grandparent_rating_key`,
 *   `user_id`, `order_column`, `order_dir` and `include_activity` as Tautulli
 *   does, so a row of another title never rescues the item under test.
 * - `get_activity`, for the inactivity read's open plays: an idle server, with no
 *   sessions, so last seen comes from `get_users_table` alone.
 *
 * Like the other mocks (`./request-log.ts`), it records each call, and
 * `POST /__reset` builds the cleanup history again at the seed's `now`. A
 * spec sets live sessions, which `include_activity=1` adds with
 * `row_id: null`, through `POST /__activity` with `{ "rows": [...] }`.
 */

/** Every user's all-time hours: over the first affiliate tier (50 h). */
export const MOCK_WATCH_HOURS = 120;

/**
 * The `get_users_table` users, by plex.tv account id: one with a last play,
 * one Tautulli knows with no play, and one whose history Tautulli does not
 * keep. Rows also carry a name, an email and an IP address, as real ones do,
 * which the app drops.
 */
export const MOCK_USERS_TABLE = {
  played: { userId: 9300001, lastSeen: new Date('2026-03-03T12:00:00Z') },
  neverPlayed: { userId: 9300002 },
  noHistory: { userId: 9300003 },
} as const;

/** Tautulli's oldest recorded play: long enough ago to cover any threshold the specs set. */
const MOCK_OLDEST_PLAY = new Date('2020-01-01T12:00:00Z');

/**
 * The cleanup history the mock pages, oldest first. It lives in the global
 * setup process: `POST /__reset` fills it again in place. A spec reads the
 * same rows from `buildCleanupWorld(now).answers.tautulli.history`.
 */
export const MOCK_CLEANUP_HISTORY: WorldPlay[] = [];

/** Live session rows that `include_activity=1` adds, set by `POST /__activity`. */
const ACTIVITY: Record<string, unknown>[] = [];

const USERS_TABLE_ROWS = [
  { user: MOCK_USERS_TABLE.played, name: 'Played', lastSeen: MOCK_USERS_TABLE.played.lastSeen.getTime() / 1000, keepHistory: 1 },
  { user: MOCK_USERS_TABLE.neverPlayed, name: 'Never played', lastSeen: null, keepHistory: 1 },
  { user: MOCK_USERS_TABLE.noHistory, name: 'No history', lastSeen: Date.parse('2026-10-01T12:00:00Z') / 1000, keepHistory: 0 },
].map(({ user, name, lastSeen, keepHistory }, index) => ({
  user_id: user.userId,
  friendly_name: `${name} E2E`,
  email: `tautulli-${user.userId}@example.com`,
  ip_address: `10.0.0.${index + 1}`,
  last_seen: lastSeen,
  keep_history: keepHistory,
  is_active: 1,
}));

const success = (data: unknown) => ({ response: { result: 'success', message: null, data } });

/** Tautulli reads `after` and `before` as days of its own zone: the mock's process zone. */
const ZONE = normalizeTimeZone(process.env.TZ) ?? 'UTC';
const KEY_COLUMNS = ['rating_key', 'parent_rating_key', 'grandparent_rating_key'] as const;

function cleanupHistory(params: URLSearchParams) {
  const after = params.get('after');
  const before = params.get('before');
  const user = params.get('user_id');
  const keys = KEY_COLUMNS.flatMap((column) => {
    const value = params.get(column);
    return value ? [{ column, wanted: new Set(value.split(',').map((key) => key.trim())) }] : [];
  });
  const keep = (row: Record<string, unknown>) => {
    const day = typeof row.started === 'number' ? dayKey(row.started * 1000, ZONE) : null;
    if (after && (day === null || day < after)) return false;
    if (before && (day === null || day > before)) return false;
    if (user && String(row.user_id) !== user) return false;
    return keys.every(({ column, wanted }) => wanted.has(String(row[column])));
  };
  const asc = params.get('order_dir') === 'asc';
  const stored = MOCK_CLEANUP_HISTORY.map((row): Record<string, unknown> => ({ ...row })).filter(keep)
    .sort((a, b) => (Number(a.started) - Number(b.started)) * (asc ? 1 : -1));
  // Tautulli adds the sessions first, with NULL AS row_id (plexpy/datafactory.py)
  const rows = params.get('include_activity') === '1' ? [...ACTIVITY.filter(keep).map((row) => ({ ...row, row_id: null })), ...stored] : stored;
  const start = Number(params.get('start') ?? 0);
  const length = Number(params.get('length') ?? 25);
  return { recordsFiltered: rows.length, recordsTotal: MOCK_CLEANUP_HISTORY.length, draw: 1, data: rows.slice(start, start + length) };
}

function answer(params: URLSearchParams): unknown {
  switch (params.get('cmd')) {
    case 'get_user_watch_time_stats':
      return success([
        { query_days: 30, total_time: 10 * 3600, total_plays: 12 },
        { query_days: 0, total_time: MOCK_WATCH_HOURS * 3600, total_plays: 300 },
      ]);
    case 'get_users_table': {
      const start = Number(params.get('start') ?? 0);
      const length = Number(params.get('length') ?? 25);
      const total = USERS_TABLE_ROWS.length;
      return success({ recordsFiltered: total, recordsTotal: total, draw: 1, data: USERS_TABLE_ROWS.slice(start, start + length) });
    }
    case 'get_history': {
      if (params.get('length') !== '1') return success(cleanupHistory(params));
      const date = MOCK_OLDEST_PLAY.getTime() / 1000;
      return success({ recordsFiltered: 1, recordsTotal: 1, draw: 1, data: [{ date, started: date, user_id: MOCK_USERS_TABLE.played.userId }] });
    }
    case 'get_activity':
      return success({ stream_count: '0', sessions: [] });
    default:
      return { response: { result: 'error', message: `No mock for ${params.get('cmd')}`, data: {} } };
  }
}

function reset(now: number): void {
  MOCK_CLEANUP_HISTORY.splice(0, MOCK_CLEANUP_HISTORY.length, ...buildCleanupWorld(now).answers.tautulli.history);
  ACTIVITY.length = 0;
}

/** Starts the mock on a free port on 127.0.0.1. */
export async function startMockTautulli(): Promise<MockServer> {
  reset(Date.now());
  return startMockServer({
    mock: 'tautulli',
    handle: ({ method, url }) => {
      if (method !== 'GET' || url.pathname !== '/api/v2') {
        return json({ response: { result: 'error', message: `No mock for ${url.pathname}`, data: {} } });
      }
      return json(answer(url.searchParams));
    },
    reset,
    control: (call) => {
      if (call.url.pathname !== '/__activity' || call.method !== 'POST') return undefined;
      const body = call.body as { rows?: unknown } | null;
      if (!body || !Array.isArray(body.rows)) return json({ message: 'POST /__activity needs { rows: [...] }' }, 400);
      ACTIVITY.splice(0, ACTIVITY.length, ...body.rows.filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object'));
      return json({ rows: ACTIVITY.length });
    },
  });
}
