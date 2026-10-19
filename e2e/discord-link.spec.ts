import { expect, test } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * P1.1 (UI-01): /discord/link is the page every Discord nudge points at. It
 * says linking is unavailable while the integration is off, and offers the
 * Discord OAuth connect link once it is on.
 */

const CONNECT_URL = '/discord/connect?redirect=%2Fdiscord%2Flink';
const TEST_INTEGRATION = {
  clientId: 'e2e-client-id',
  clientSecret: 'e2e-client-secret',
  serverInviteCode: 'e2einvite',
};

type IntegrationFields = {
  isEnabled: boolean;
  clientId: string | null;
  clientSecret: string | null;
  serverInviteCode: string | null;
};

async function writeIntegration(data: IntegrationFields) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.discordIntegration.upsert({
      where: { id: 'discord' },
      create: { id: 'discord', ...data },
      update: data,
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Discord link page', () => {
  let previous: IntegrationFields | null = null;

  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      previous = await prisma.discordIntegration.findUnique({
        where: { id: 'discord' },
        select: { isEnabled: true, clientId: true, clientSecret: true, serverInviteCode: true },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    if (previous) {
      await writeIntegration(previous);
      return;
    }
    const prisma = createE2EPrismaClient();
    try {
      await prisma.discordIntegration.deleteMany({ where: { id: 'discord' } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('shows the unavailable state while the integration is disabled', async ({ regularUserPage }) => {
    await writeIntegration({ ...TEST_INTEGRATION, isEnabled: false });

    await regularUserPage.goto('/discord/link');

    await expect(regularUserPage.getByTestId('discord-link-unavailable')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(regularUserPage.getByTestId('discord-link-connect')).toHaveCount(0);
  });

  test('offers the connect link once the integration is enabled', async ({ regularUserPage }) => {
    await writeIntegration({ ...TEST_INTEGRATION, isEnabled: true });

    await regularUserPage.goto('/discord/link');

    await expect(regularUserPage.getByTestId('discord-link-panel')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(regularUserPage.getByTestId('discord-link-connect')).toHaveAttribute('href', CONNECT_URL);
    await expect(regularUserPage.getByTestId('discord-link-join-server')).toHaveAttribute('href', 'https://discord.gg/e2einvite');
  });

  // P4.9 (SEC-13): the authorization is bound to this browser by a cookie,
  // and a callback whose state does not match it links nothing.
  test('binds the authorization to the browser and refuses a foreign state', async ({ regularUserPage }) => {
    await writeIntegration({ ...TEST_INTEGRATION, isEnabled: true });

    const connect = await regularUserPage.request.get('/discord/connect?redirect=%2F%5Cevil.com', { maxRedirects: 0 });
    expect(connect.status()).toBe(307);
    const authorize = new URL(connect.headers()['location'] ?? '');
    expect(authorize.origin).toBe('https://discord.com');

    const cookie = (await regularUserPage.context().cookies()).find((c) => c.name === 'pm-discord-oauth');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/discord/callback' });

    const foreignState = 'Z'.repeat(32);
    expect(authorize.searchParams.get('state')).not.toBe(foreignState);
    const callback = await regularUserPage.request.get(`/api/discord/callback?code=abc&state=${foreignState}`, {
      maxRedirects: 0,
    });
    const landing = new URL(callback.headers()['location'] ?? '');
    expect(landing.pathname).toBe('/');
    expect(landing.searchParams.get('flash')).toBe('discord_session_mismatch');
  });
});
