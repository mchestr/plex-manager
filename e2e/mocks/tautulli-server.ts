import { createServer, type Server, type ServerResponse } from 'node:http';

/**
 * A stand-in for Tautulli, so the affiliate specs can make an invite: Make
 * reads the member's watch time live. The app calls Tautulli from the server,
 * so Playwright's `page.route` cannot intercept the request; global setup
 * starts this on a free port and exports its URL as `E2E_TAUTULLI_URL`, and a
 * spec points an active `Tautulli.url` at it.
 *
 * `GET /api/v2?cmd=get_user_watch_time_stats` answers every user with
 * {@link MOCK_WATCH_HOURS} all time and 10 hours in the last 30 days, in
 * Tautulli's `response` envelope. Any other command is an error.
 */

/** Every user's all-time hours: over the first affiliate tier (50 h). */
export const MOCK_WATCH_HOURS = 120;

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Starts the mock on a free port on 127.0.0.1. */
export async function startMockTautulli(): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    if (req.method !== 'GET' || url.pathname !== '/api/v2' || url.searchParams.get('cmd') !== 'get_user_watch_time_stats') {
      return send(res, 200, { response: { result: 'error', message: `No mock for ${url.searchParams.get('cmd')}`, data: {} } });
    }
    return send(res, 200, {
      response: {
        result: 'success',
        message: null,
        data: [
          { query_days: 30, total_time: 10 * 3600, total_plays: 12 },
          { query_days: 0, total_time: MOCK_WATCH_HOURS * 3600, total_plays: 300 },
        ],
      },
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, server };
}
