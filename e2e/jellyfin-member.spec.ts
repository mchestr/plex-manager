import { expect, test } from './fixtures/auth';
import { mintSessionToken, sessionCookieName, signInAs } from './fixtures/session';
import { JELLYFIN_MEMBERS } from './helpers/jellyfin-members';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * Jellyfin members end to end (P11.10), against the mock Jellyfin server that
 * global setup starts (`e2e/mocks/jellyfin-server.ts`). This file points an
 * active, sign-in-enabled JellyfinServer row at the mock and removes it
 * afterwards, so every other spec keeps its Plex-only sign-in. It also
 * re-seeds the Jellyfin members global setup creates, because the shared
 * visual seed (`seedVisualFixtures`) deletes every other user when an earlier
 * spec runs it.
 */

const SERVER_ID = 'e2e-jellyfin-member-mock';
const [JF_MEMBER] = JELLYFIN_MEMBERS;

function mockUrl(): string {
  const url = process.env.E2E_JELLYFIN_URL;
  if (!url) throw new Error('E2E_JELLYFIN_URL is unset: e2e/global-setup.ts starts the mock Jellyfin server');
  return url;
}

test.describe('Jellyfin members', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      const row = { name: 'E2E Jellyfin', url: mockUrl(), apiKey: 'e2e-jellyfin-key', isActive: true, enabledForLogin: true };
      // One active Jellyfin row, so every read lands on the mock
      await prisma.jellyfinServer.updateMany({ where: { id: { not: SERVER_ID } }, data: { isActive: false } });
      await prisma.jellyfinServer.upsert({ where: { id: SERVER_ID }, create: { id: SERVER_ID, ...row }, update: row });
      for (const member of JELLYFIN_MEMBERS) {
        await prisma.user.upsert({ where: { id: member.id }, create: member, update: member });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.jellyfinServer.deleteMany({ where: { id: SERVER_ID } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('an invited Jellyfin member signs in to the Jellyfin onboarding and a Jellyfin tile', async ({ page }) => {
    const prisma = createE2EPrismaClient();
    const code = `JFM${Date.now()}`.substring(0, 8).toUpperCase();
    const username = `e2e-jf-${Date.now()}`;
    const password = 'e2e-jellyfin-password';

    try {
      await prisma.invite.create({ data: { code, serverType: 'JELLYFIN', maxUses: 1, useCount: 0 } });

      await page.goto(`/invite/${code}`);
      await expect(page.getByTestId('jellyfin-invite-form')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await page.getByTestId('jellyfin-username-input').fill(username);
      await page.getByTestId('jellyfin-password-input').fill(password);
      await page.getByTestId('jellyfin-confirm-password-input').fill(password);
      await page.getByTestId('jellyfin-submit-button').click();
      await expect(page.getByTestId('jellyfin-success-heading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      await page.goto('/');
      await page.getByTestId('toggle-jellyfin').click();
      await page.getByTestId('jellyfin-username').fill(username);
      await page.getByTestId('jellyfin-password').fill(password);
      await page.getByTestId('jellyfin-submit').click();

      await expect(page.getByTestId('onboarding-service-jellyfin')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      for (const step of ['welcome', 'playback', 'requests', 'support']) {
        const next = page.getByTestId(`onboarding-${step}-continue`);
        if (await next.count()) await next.click();
      }
      await page.getByTestId('onboarding-final-complete').click();

      const tile = page.getByTestId('home-quick-link-jellyfin');
      await expect(tile).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(tile).toHaveAttribute('href', new RegExp(`^${mockUrl().replace(/[.:/]/g, '\\$&')}`));
      await expect(page.getByTestId('home-quick-link-plex')).toHaveCount(0);

      const row = await prisma.user.findFirst({ where: { name: username }, select: { primaryAuthService: true } });
      expect(row?.primaryAuthService).toBe('jellyfin');
    } finally {
      await prisma.user.deleteMany({ where: { name: username } });
      await prisma.invite.deleteMany({ where: { code } });
      await prisma.$disconnect();
    }
  });

  test('an admin sees the service and turns Jellyfin access off, which signs the member out', async ({ adminPage, browser, baseURL }) => {
    if (!baseURL) throw new Error('baseURL is required');
    const prisma = createE2EPrismaClient();
    const memberContext = await browser.newContext();

    try {
      const { sessionVersion } = await prisma.user.findUniqueOrThrow({ where: { id: JF_MEMBER.id }, select: { sessionVersion: true } });
      await signInAs(memberContext, baseURL, JF_MEMBER.id);
      const member = await memberContext.newPage();
      await member.goto('/');
      await expect(member.getByTestId('home-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      await adminPage.goto(`/admin/users?service=jellyfin&q=${JF_MEMBER.name}`);
      await expect(adminPage.getByTestId(`admin-users-row-${JF_MEMBER.id}`).getByTestId('admin-user-service-badge')).toHaveText('Jellyfin');

      await adminPage.goto(`/admin/users/${JF_MEMBER.id}`);
      await expect(adminPage.getByTestId('admin-user-service')).toContainText('Jellyfin');
      await expect(adminPage.getByTestId('admin-user-jellyfin-id')).toHaveText(JF_MEMBER.jellyfinUserId);
      await expect(adminPage.getByTestId('admin-user-jellyfin-status')).toHaveAttribute('data-status', 'enabled');

      await adminPage.getByTestId('admin-user-jellyfin-disable-open').click();
      await adminPage.getByTestId('admin-user-jellyfin-disable-confirm-text').fill(JF_MEMBER.name);
      await adminPage.getByTestId('admin-user-jellyfin-disable-confirm').click();
      await expect(adminPage.getByTestId('admin-user-jellyfin-status')).toHaveAttribute('data-status', 'disabled', {
        timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
      });

      const onMock = (await (await fetch(`${mockUrl()}/__mock/users/${JF_MEMBER.jellyfinUserId}`)).json()) as {
        Policy: Record<string, unknown>;
      };
      expect(onMock.Policy).toMatchObject({ IsDisabled: true, EnabledFolders: ['e2e-films', 'e2e-series'] });

      // The member's session as it was before, once the recheck interval has passed
      const secret = process.env.NEXTAUTH_SECRET;
      if (!secret) throw new Error('NEXTAUTH_SECRET is required');
      const stale = await mintSessionToken(
        { id: JF_MEMBER.id, name: JF_MEMBER.name, email: null, image: null, isAdmin: false, sessionVersion },
        secret
      );
      await memberContext.addCookies([{ name: sessionCookieName(baseURL), value: stale, url: baseURL, httpOnly: true, sameSite: 'Lax' }]);
      await member.goto('/');
      await expect(member.getByTestId('member-pass')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    } finally {
      await memberContext.close();
      // Turn the account back on for later runs against the same mock
      await adminPage.goto(`/admin/users/${JF_MEMBER.id}`);
      const enable = adminPage.getByTestId('admin-user-jellyfin-enable-open');
      if (await enable.count()) {
        await enable.click();
        await adminPage.getByTestId('admin-user-jellyfin-enable-confirm').click();
      }
      await prisma.$disconnect();
    }
  });
});
