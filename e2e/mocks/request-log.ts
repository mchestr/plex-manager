import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * The request log of the E2E mocks, and the small HTTP frame they share
 * (TS 16.4, delivery-r3-4).
 *
 * Every mock starts in the Playwright global setup process, so the one
 * module-level counter below numbers the calls of every mock in the order
 * they came. A spec reads two logs and orders their records by `seq`, for
 * example "the collection item removal came before the Radarr delete".
 *
 * Each mock answers three control routes, which it does not record:
 *
 * - `GET /__requests`: the records, oldest first.
 * - `DELETE /__requests`: forget the records.
 * - `POST /__reset` with the JSON body `{ "now": <epoch ms> }`: build the
 *   state again from `buildCleanupWorld(now)` and forget the records. The
 *   seed sends its own `now`, so the mocks and the seed use one clock
 *   (delivery-r6-5).
 *
 * A record never holds a token or an API key: query parameters with such a
 * name are left out, and headers are not recorded.
 */

/** One request that a mock answered. */
export interface MockRequest {
  /** The order of the call across every mock (one counter in the global setup process). */
  seq: number;
  /** The mock that answered: `plex`, `plexTv`, `radarr`, `sonarr`, `overseerr` or `tautulli`. */
  mock: MockName;
  method: string;
  /** The path, without the query. */
  path: string;
  /** The query parameters, without secrets. A repeated name keeps its last value. */
  query: Record<string, string>;
  contentType: string | null;
  /** The parsed JSON body, the text of any other body, or null. */
  body: unknown;
  /** The status the mock answered. */
  status: number;
  /** ISO time of the call. */
  at: string;
}

export type MockName = 'plex' | 'plexTv' | 'radarr' | 'sonarr' | 'overseerr' | 'tautulli';

/**
 * The environment variable that holds each mock's URL. The global setup sets
 * them, so every worker inherits them. `E2E_PLEX_TV_URL` comes from
 * `playwright.config.ts`, because the web server needs it before the global
 * setup runs (TS E27).
 */
export const MOCK_URL_ENV: Record<MockName, string> = {
  plex: 'E2E_PLEX_URL',
  plexTv: 'E2E_PLEX_TV_URL',
  radarr: 'E2E_RADARR_URL',
  sonarr: 'E2E_SONARR_URL',
  overseerr: 'E2E_OVERSEERR_URL',
  tautulli: 'E2E_TAUTULLI_URL',
};

/** The mocks that `POST /__reset` builds again from the world, in the order the seed resets them. */
export const RESET_MOCKS: readonly MockName[] = ['plex', 'plexTv', 'radarr', 'sonarr', 'overseerr', 'tautulli'];

let lastSeq = 0;

/** The next number of the shared counter. */
export function nextSeq(): number {
  lastSeq += 1;
  return lastSeq;
}

const SECRET_PARAM = /token|apikey|api_key|password|secret/i;

/** What a mock route sees of a request. */
export interface MockCall {
  method: string;
  url: URL;
  headers: IncomingMessage['headers'];
  contentType: string | null;
  /** The body as text ('' for none). */
  text: string;
  /** The parsed body: JSON for a JSON content type, else the text, or null for no body. */
  body: unknown;
}

/** A mock route's answer. `json` wins over `bytes`, and `bytes` over `text`. */
export interface MockAnswer {
  status: number;
  json?: unknown;
  bytes?: Buffer;
  text?: string;
  contentType?: string;
}

export const json = (value: unknown, status = 200): MockAnswer => ({ status, json: value });
export const text = (value: string, status = 200, contentType = 'text/plain'): MockAnswer => ({ status, text: value, contentType });
export const empty = (status = 200): MockAnswer => ({ status, text: '' });
export const notFound = (): MockAnswer => json({ message: 'Not Found' }, 404);

export interface MockServerOptions {
  mock: MockName;
  /** 0 or absent: a free port. */
  port?: number;
  /** Answers every route but the control routes. */
  handle: (call: MockCall) => MockAnswer | Promise<MockAnswer>;
  /** Builds the state again from the world at `now` (`POST /__reset`). */
  reset: (now: number) => void;
  /**
   * Extra control routes of one mock, such as the Plex sessions. Return
   * undefined for a path that is not one. Not recorded.
   */
  control?: (call: MockCall) => MockAnswer | undefined;
}

export interface MockServer {
  mock: MockName;
  url: string;
  server: Server;
  /** The records so far, oldest first. */
  requests: () => MockRequest[];
  close: () => Promise<void>;
}

async function readText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function parseBody(raw: string, contentType: string | null): unknown {
  if (raw === '') return null;
  if (contentType?.includes('json')) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  }
  return raw;
}

function publicQuery(url: URL): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [name, value] of url.searchParams) if (!SECRET_PARAM.test(name)) query[name] = value;
  return query;
}

function send(res: ServerResponse, answer: MockAnswer): void {
  if (answer.json !== undefined) {
    res.writeHead(answer.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(answer.json));
    return;
  }
  if (answer.bytes) {
    res.writeHead(answer.status, { 'Content-Type': answer.contentType ?? 'application/octet-stream' });
    res.end(answer.bytes);
    return;
  }
  res.writeHead(answer.status, answer.text ? { 'Content-Type': answer.contentType ?? 'text/plain' } : {});
  res.end(answer.text ?? '');
}

/** Whether a reset body holds a usable clock. */
function resetNow(body: unknown): number | null {
  if (body === null || typeof body !== 'object' || !('now' in body)) return null;
  const now = (body as { now: unknown }).now;
  return typeof now === 'number' && Number.isFinite(now) && now > 0 ? now : null;
}

/**
 * Starts one mock on 127.0.0.1 with the control routes and the request log.
 * A route that throws answers 500, and the call is still recorded.
 */
export async function startMockServer(options: MockServerOptions): Promise<MockServer> {
  const log: MockRequest[] = [];
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://mock');
      const contentType = req.headers['content-type'] ?? null;
      const raw = await readText(req);
      const call: MockCall = { method: req.method ?? 'GET', url, headers: req.headers, contentType, text: raw, body: parseBody(raw, contentType) };

      if (url.pathname === '/__requests') {
        if (call.method === 'DELETE') log.length = 0;
        return send(res, call.method === 'DELETE' ? empty(204) : json(log));
      }
      if (url.pathname === '/__reset' && call.method === 'POST') {
        const now = resetNow(call.body);
        if (now === null) return send(res, json({ message: 'POST /__reset needs a JSON body { now: <epoch ms> }' }, 400));
        options.reset(now);
        log.length = 0;
        return send(res, json({ now }));
      }
      const controlled = url.pathname.startsWith('/__') ? options.control?.(call) : undefined;
      if (controlled) return send(res, controlled);

      const seq = nextSeq();
      let answer: MockAnswer;
      try {
        answer = await options.handle(call);
      } catch (error) {
        answer = json({ message: error instanceof Error ? error.message : 'Mock failure' }, 500);
      }
      log.push({
        seq,
        mock: options.mock,
        method: call.method,
        path: url.pathname,
        query: publicQuery(url),
        contentType,
        body: call.body,
        status: answer.status,
        at: new Date().toISOString(),
      });
      send(res, answer);
    })().catch(() => {
      if (!res.headersSent) send(res, json({ message: 'Mock failure' }, 500));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  const { port } = server.address() as { port: number };
  return {
    mock: options.mock,
    url: `http://127.0.0.1:${port}`,
    server,
    requests: () => [...log],
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // Keep-alive sockets of the clients would hold the close open
        server.closeAllConnections();
      }),
  };
}

/** A mock's URL from the environment that the global setup and the config set. */
export function mockUrl(mock: MockName): string {
  const name = MOCK_URL_ENV[mock];
  const url = process.env[name];
  if (!url) throw new Error(`${name} is unset: e2e/global-setup.ts starts the ${mock} mock`);
  return url.replace(/\/+$/, '');
}

/** The records of one mock, oldest first. */
export async function mockRequests(mock: MockName): Promise<MockRequest[]> {
  const response = await fetch(`${mockUrl(mock)}/__requests`);
  if (!response.ok) throw new Error(`The ${mock} mock answered ${response.status} to GET /__requests`);
  return (await response.json()) as MockRequest[];
}

/** Forgets the records of one mock. */
export async function clearMockRequests(mock: MockName): Promise<void> {
  const response = await fetch(`${mockUrl(mock)}/__requests`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`The ${mock} mock answered ${response.status} to DELETE /__requests`);
}

/** Builds one mock's state again from the world at `now`, and forgets its records. */
export async function resetMock(mock: MockName, now: number): Promise<void> {
  const response = await fetch(`${mockUrl(mock)}/__reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ now }),
  });
  if (!response.ok) throw new Error(`The ${mock} mock answered ${response.status} to POST /__reset`);
}
