import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { expect, test } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { MOCK_SHARED_SECTIONS } from './mocks/plex-tv-server';

/**
 * The poster route's library check (SEC-21) for a member who doesn't own the
 * server: plex.tv's share list comes from the mock global setup starts
 * (`e2e/mocks/plex-tv-server.ts`), and the item's section from a stub Plex
 * server. The regular member may fetch a poster from section 1, which is
 * shared with them, and gets a 404 for one from section 2, which isn't.
 */

const MACHINE_ID = 'e2e-library-access-machine';
const SHARED = { ratingKey: '91001', section: '1' };
const UNSHARED = { ratingKey: '92001', section: '2' };
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/** Answers identity, item metadata and the photo transcoder; everything else is a 404. */
function startStubPlex(): Promise<Server> {
  const sections: Record<string, string> = { [SHARED.ratingKey]: SHARED.section, [UNSHARED.ratingKey]: UNSHARED.section };
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://stub');
    const item = /^\/library\/metadata\/(\d+)$/.exec(pathname)?.[1];
    if (pathname === '/identity') {
      response.writeHead(200, { 'Content-Type': 'application/xml' });
      response.end(`<?xml version="1.0" encoding="UTF-8"?><MediaContainer size="0" machineIdentifier="${MACHINE_ID}" />`);
    } else if (item && sections[item]) {
      const librarySectionID = Number(sections[item]);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({ MediaContainer: { librarySectionID, Metadata: [{ ratingKey: item, type: 'movie', title: `Film ${item}`, librarySectionID }] } })
      );
    } else if (pathname === '/photo/:/transcode') {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      response.end(PNG);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function setPlexUrl(url: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexServer.updateMany({ where: { isActive: true }, data: { url } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Poster library access for a member', () => {
  let stub: Server;
  let originalUrl: string | null = null;

  test.beforeAll(async () => {
    expect(Object.values(MOCK_SHARED_SECTIONS).flat()).toContain(SHARED.section);
    stub = await startStubPlex();
    const prisma = createE2EPrismaClient();
    try {
      originalUrl = (await prisma.plexServer.findFirst({ where: { isActive: true }, select: { url: true } }))?.url ?? null;
    } finally {
      await prisma.$disconnect();
    }
    await setPlexUrl(`http://127.0.0.1:${(stub.address() as AddressInfo).port}`);
  });

  test.afterAll(async () => {
    if (originalUrl) await setPlexUrl(originalUrl);
    await new Promise((resolve) => stub.close(resolve));
  });

  test('serves a poster from a section shared with the member', async ({ regularUserPage: page }) => {
    const response = await page.request.get(`/api/rewind/poster/${SHARED.ratingKey}?w=96`);

    expect(response.status()).toBe(200);
    // The route renders the stub's PNG as WebP
    expect(response.headers()['content-type']).toBe('image/webp');
    expect((await response.body()).length).toBeGreaterThan(0);
  });

  test('answers 404 for a poster from a section not shared with the member', async ({ regularUserPage: page }) => {
    const response = await page.request.get(`/api/rewind/poster/${UNSHARED.ratingKey}?w=96`);

    expect(response.status()).toBe(404);
  });
});
