import { createServer, type Server, type ServerResponse } from 'node:http';

/**
 * A stand-in for Tautulli. The app calls Tautulli from the server, so
 * Playwright's `page.route` cannot intercept the request; global setup starts
 * this on a free port and exports its URL as `E2E_TAUTULLI_URL`, and a spec
 * points an active `Tautulli.url` at it.
 *
 * Two commands answer, in Tautulli's `response` envelope; any other is an error:
 *
 * - `get_user_watch_time_stats`, for the affiliate specs (Make reads the
 *   member's watch time live): every user has {@link MOCK_WATCH_HOURS} all
 *   time and 10 hours in the last 30 days.
 * - `get_users_table`, for the inactive members spec (the daily last seen
 *   read): the users in {@link MOCK_USERS_TABLE}, paged by `start` and
 *   `length` as Tautulli's DataTables call is.
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

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const success = (data: unknown) => ({ response: { result: 'success', message: null, data } });

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
    default:
      return { response: { result: 'error', message: `No mock for ${params.get('cmd')}`, data: {} } };
  }
}

/** Starts the mock on a free port on 127.0.0.1. */
export async function startMockTautulli(): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    if (req.method !== 'GET' || url.pathname !== '/api/v2') {
      return send(res, 200, { response: { result: 'error', message: `No mock for ${url.pathname}`, data: {} } });
    }
    return send(res, 200, answer(url.searchParams));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, server };
}
