import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * A small stand-in for a Jellyfin server (P11.10). The app calls Jellyfin from
 * the server, so Playwright's `page.route` cannot intercept these requests;
 * global setup starts this on a free port and exports its URL as
 * `E2E_JELLYFIN_URL`, and the specs that need Jellyfin point a seeded
 * `JellyfinServer.url` at it.
 *
 * It answers the calls the app makes: `/System/Info/Public`,
 * `/Users/AuthenticateByName`, `/Sessions/Logout`, `/Users/New`,
 * `/Users/{id}` (GET and DELETE) and `/Users/{id}/Policy`. A disabled user
 * cannot sign in, as on a real server. `GET /__mock/users/{id}` lets a spec
 * read what the app wrote; it is not a Jellyfin endpoint.
 */

export interface MockJellyfinUser {
  id: string;
  name: string;
  password: string;
  policy: Record<string, unknown>;
}

/** Seeded users, matching `prisma/seed.ts` and `e2e/global-setup.ts`. */
export const MOCK_JELLYFIN_USERS = [
  { id: 'jf-member-jellyfin-id', name: 'jf-member', password: 'jf-member-password' },
  { id: 'both-member-jellyfin-id', name: 'both-member', password: 'both-member-password' },
] as const satisfies readonly Omit<MockJellyfinUser, 'policy'>[];

const DEFAULT_POLICY = {
  IsAdministrator: false,
  IsDisabled: false,
  EnableAllFolders: false,
  EnabledFolders: ['e2e-films', 'e2e-series'],
  EnableRemoteAccess: true,
};

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, body === undefined ? {} : { 'Content-Type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

const toJellyfin = (user: MockJellyfinUser) => ({
  Id: user.id,
  Name: user.name,
  HasPassword: true,
  HasConfiguredPassword: true,
  Policy: user.policy,
});

/** Starts the mock on a free port on 127.0.0.1. */
export async function startMockJellyfin(): Promise<{ url: string; server: Server }> {
  const users = new Map<string, MockJellyfinUser>(
    MOCK_JELLYFIN_USERS.map((user) => [user.id, { ...user, policy: { ...DEFAULT_POLICY } }])
  );

  const server = createServer((req, res) => {
    void handle(req, res).catch(() => send(res, 500, { message: 'mock error' }));
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const { pathname } = new URL(req.url ?? '/', 'http://mock');
    const method = req.method ?? 'GET';
    const userPath = /^\/Users\/([^/]+)(\/Policy)?$/.exec(pathname);
    const mockPath = /^\/__mock\/users\/([^/]+)$/.exec(pathname);

    if (method === 'GET' && pathname === '/System/Info/Public') {
      return send(res, 200, { ServerName: 'E2E Jellyfin', Version: '10.10.0', Id: 'e2e-jellyfin' });
    }
    if (method === 'POST' && pathname === '/Users/AuthenticateByName') {
      const body = await readJson(req);
      const user = [...users.values()].find((candidate) => candidate.name === body.Username);
      if (!user || user.password !== body.Pw || user.policy.IsDisabled === true) return send(res, 401);
      return send(res, 200, { User: toJellyfin(user), AccessToken: randomUUID(), ServerId: 'e2e-jellyfin' });
    }
    if (method === 'POST' && pathname === '/Sessions/Logout') return send(res, 204);
    if (method === 'POST' && pathname === '/Users/New') {
      const body = await readJson(req);
      const name = String(body.Name ?? '');
      if (!name || [...users.values()].some((user) => user.name === name)) return send(res, 400, { message: 'Name taken' });
      const user = { id: randomUUID().replace(/-/g, ''), name, password: String(body.Password ?? ''), policy: { ...DEFAULT_POLICY } };
      users.set(user.id, user);
      return send(res, 200, toJellyfin(user));
    }
    if (mockPath && method === 'GET') {
      const user = users.get(decodeURIComponent(mockPath[1]));
      return user ? send(res, 200, toJellyfin(user)) : send(res, 404);
    }
    if (userPath && userPath[1] !== 'New') {
      const user = users.get(decodeURIComponent(userPath[1]));
      if (!user) return send(res, 404);
      if (userPath[2] && method === 'POST') {
        // Jellyfin replaces the whole policy with the body
        user.policy = await readJson(req);
        return send(res, 204);
      }
      if (!userPath[2] && method === 'GET') return send(res, 200, toJellyfin(user));
      if (!userPath[2] && method === 'DELETE') {
        users.delete(user.id);
        return send(res, 204);
      }
    }
    return send(res, 404);
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, server };
}
