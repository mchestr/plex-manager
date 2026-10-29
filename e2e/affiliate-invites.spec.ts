import type { Browser, Page } from '@playwright/test';

import { Prisma } from '../lib/generated/prisma/client';
import { expect, test } from './fixtures/auth';
import { signInAs } from './fixtures/session';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The member Invites page end to end, with affiliate invites switched on for
 * this file only. Rows are seeded directly: an active Plex server whose
 * machine identifier the switch names, an active Tautulli row on the mock
 * Tautulli server (`e2e/mocks/tautulli-server.ts`; Make reads watch time
 * live), and members in each standing.
 *
 * Make also checks the affiliate's Plex share on plex.tv. The seeded server
 * names the affiliate as its owner, which the share check grants without
 * asking plex.tv. A member's share on plex.tv (granted, denied, unknown) and
 * Apply's live checks are covered by the unit tests
 * (`lib/affiliates/__tests__/member-invites.test.ts`, `actions/__tests__/affiliate.test.ts`)
 * and the Postgres suite (`member-invites.pg.test.ts`).
 *
 * afterAll deletes every row the file made and puts the switch back.
 */

const P = 'e2e-aff';
const MACHINE = `${P}-machine`;
const SERVER_ID = `${P}-plex`;
const TAUTULLI_ID = `${P}-tautulli`;
const DAY = 24 * 60 * 60 * 1000;

const AFFILIATE = { id: `${P}-sam`, name: 'Sam Affiliate', plexUserId: '9100001' };
const STANDING = {
  below_bar: { id: `${P}-below`, watchHours: 23 },
  can_apply: { id: `${P}-can`, watchHours: null },
  pending: { id: `${P}-pending`, watchHours: 80 },
  refused: { id: `${P}-refused`, watchHours: 80 },
  paused: { id: `${P}-paused`, watchHours: 80 },
} as const;
const JOINED = {
  active: { inviteId: `${P}-join-active`, userId: `${P}-ana`, name: 'Ana Joined' },
  left: { inviteId: `${P}-join-left`, userId: `${P}-bo`, name: 'Bo Joined' },
  removed: { inviteId: `${P}-join-removed` },
} as const;

const SWITCH_FIELDS = {
  affiliateInvitesEnabled: true,
  affiliatePlexMachineId: true,
  affiliateLibrarySectionIds: true,
  affiliateServerCap: true,
} as const;
let savedSwitch: Prisma.ConfigGetPayload<{ select: typeof SWITCH_FIELDS }> | null = null;

function tautulliUrl(): string {
  const url = process.env.E2E_TAUTULLI_URL;
  if (!url) throw new Error('E2E_TAUTULLI_URL is unset: e2e/global-setup.ts starts the mock Tautulli server');
  return url;
}

const member = (id: string, extra: Partial<Prisma.UserUncheckedCreateInput> = {}): Prisma.UserUncheckedCreateInput => ({
  id,
  name: id,
  email: `${id}@example.com`,
  primaryAuthService: 'plex',
  onboardingStatus: { plex: true, jellyfin: false },
  ...extra,
});

async function setSwitch(on: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.config.update({ where: { id: 'config' }, data: { affiliateInvitesEnabled: on } });
  } finally {
    await prisma.$disconnect();
  }
}

async function seed() {
  const prisma = createE2EPrismaClient();
  try {
    savedSwitch = await prisma.config.findUnique({ where: { id: 'config' }, select: SWITCH_FIELDS });
    const on = { affiliateInvitesEnabled: true, affiliatePlexMachineId: MACHINE, affiliateLibrarySectionIds: [1], affiliateServerCap: null };
    await prisma.config.upsert({ where: { id: 'config' }, create: { id: 'config', ...on }, update: on });

    // The newest active rows, so the switch and Make read these. The server keeps the current name, which
    // the shell and the invite page read through a cache
    const current = await prisma.plexServer.findFirst({ where: { isActive: true }, orderBy: { updatedAt: 'desc' }, select: { name: true } });
    const server = { name: current?.name ?? 'Test Server', url: 'http://localhost:32400', token: 'test-token', adminPlexUserId: AFFILIATE.plexUserId, machineIdentifier: MACHINE, isActive: true };
    await prisma.plexServer.upsert({ where: { id: SERVER_ID }, create: { id: SERVER_ID, ...server }, update: server });
    const tautulli = { name: 'E2E Tautulli', url: tautulliUrl(), apiKey: 'e2e-tautulli-key', isActive: true };
    await prisma.tautulli.upsert({ where: { id: TAUTULLI_ID }, create: { id: TAUTULLI_ID, ...tautulli }, update: tautulli });

    await cleanUp(prisma);
    await prisma.user.create({ data: member(AFFILIATE.id, { name: AFFILIATE.name, plexUserId: AFFILIATE.plexUserId, watchHours: 120 }) });
    await prisma.affiliateApplication.create({ data: { userId: AFFILIATE.id, openUserId: AFFILIATE.id, status: 'APPROVED', hoursAtApply: 120 } });

    for (const [state, row] of Object.entries(STANDING)) {
      await prisma.user.create({ data: member(row.id, { plexUserId: `91000${Object.keys(STANDING).indexOf(state) + 10}`, watchHours: row.watchHours }) });
    }
    await prisma.affiliateApplication.create({ data: { userId: STANDING.pending.id, openUserId: STANDING.pending.id, status: 'PENDING', hoursAtApply: 80 } });
    await prisma.affiliateApplication.create({
      data: { userId: STANDING.refused.id, status: 'REFUSED', hoursAtApply: 80, reason: 'Your account is too new.', decidedAt: new Date(Date.now() - 2 * DAY) },
    });
    await prisma.affiliateApplication.create({ data: { userId: STANDING.paused.id, openUserId: STANDING.paused.id, status: 'APPROVED', hoursAtApply: 80 } });
    await prisma.subscription.create({ data: { userId: STANDING.paused.id, status: 'ACTIVE' } });

    // Joins older than 30 days, so the affiliate's one place is free
    await prisma.user.create({ data: member(JOINED.active.userId, { name: JOINED.active.name }) });
    await prisma.user.create({ data: member(JOINED.left.userId, { name: JOINED.left.name, disabledAt: new Date() }) });
    const join = (id: string, days: number, joinedUserId: string | null) =>
      prisma.invite.create({
        data: { id, code: id.toUpperCase().replaceAll('-', ''), kind: 'AFFILIATE', affiliateUserId: AFFILIATE.id, maxUses: 1, useCount: 1, joinedAt: new Date(Date.now() - days * DAY), joinedUserId, librarySectionIds: '[1]' },
      });
    await join(JOINED.active.inviteId, 40, JOINED.active.userId);
    await join(JOINED.left.inviteId, 50, JOINED.left.userId);
    await join(JOINED.removed.inviteId, 60, null);
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanUp(prisma: ReturnType<typeof createE2EPrismaClient>) {
  await prisma.invite.deleteMany({ where: { affiliateUserId: AFFILIATE.id } });
  await prisma.user.deleteMany({ where: { id: { startsWith: P } } });
}

async function memberPage(browser: Browser, baseURL: string, userId: string): Promise<Page> {
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await signInAs(context, baseURL, userId);
  return context.newPage();
}

test.describe('Member invites (affiliates)', () => {
  test.beforeAll(seed);

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await cleanUp(prisma);
      await prisma.plexServer.deleteMany({ where: { id: SERVER_ID } });
      await prisma.tautulli.deleteMany({ where: { id: TAUTULLI_ID } });
      const restore = savedSwitch ?? { affiliateInvitesEnabled: false, affiliatePlexMachineId: null, affiliateServerCap: 10 };
      await prisma.config.update({
        where: { id: 'config' },
        data: { ...restore, affiliateLibrarySectionIds: savedSwitch?.affiliateLibrarySectionIds ?? Prisma.DbNull },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('the nav item opens the page, and the page is a 404 while the switch is off', async ({ browser, baseURL }) => {
    const page = await memberPage(browser, baseURL!, AFFILIATE.id);
    await page.goto('/');
    await page.getByTestId('member-nav-invites').click();
    await expect(page.getByTestId('invites-standing')).toHaveAttribute('data-state', 'approved', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await setSwitch(false);
    try {
      const response = await page.goto('/invites');
      expect(response?.status()).toBe(404);
      await page.goto('/');
      await expect(page.getByTestId('member-nav-home')).toBeVisible();
      await expect(page.getByTestId('member-nav-invites')).toHaveCount(0);
    } finally {
      await setSwitch(true);
    }
    await page.context().close();
  });

  for (const [state, row] of Object.entries(STANDING)) {
    test(`shows the ${state} standing from the stored values`, async ({ browser, baseURL }) => {
      const page = await memberPage(browser, baseURL!, row.id);
      await page.goto('/invites');
      await expect(page.getByTestId('invites-standing')).toHaveAttribute('data-state', state, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      if (state === 'below_bar') await expect(page.getByTestId('invites-standing')).toContainText('You have 23 h; you can apply at 50 h.');
      if (state === 'can_apply') await expect(page.getByTestId('invites-apply-submit')).toBeVisible();
      if (state === 'refused') await expect(page.getByTestId('invites-standing-reason')).toContainText('Your account is too new.');
      await page.context().close();
    });
  }

  test('makes an invite with a label, copies it, opens it, cancels it', async ({ browser, baseURL }) => {
    const page = await memberPage(browser, baseURL!, AFFILIATE.id);
    await page.goto('/invites');
    await expect(page.getByTestId('invites-allowance')).toHaveText('1 every 30 days, 1 free now', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await page.getByTestId('invites-make-open').click();
    await expect(page.getByTestId('invites-make-preview')).toContainText('Sam Affiliate invited you to');
    const headline = await page.getByTestId('invites-make-preview').textContent();
    await page.getByTestId('invites-make-label-input').fill('For my brother');
    await page.getByTestId('invites-make-submit').click();

    const link = page.getByTestId('invites-make-link');
    await expect(link).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    const path = (await link.textContent())?.trim() ?? '';
    expect(path).toMatch(/^\/invite\/[A-Z2-9]{8}$/);
    await page.getByTestId('invites-make-copy').click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(baseURL!).origin}${path}`);
    await page.getByTestId('invites-make-done').click();

    await expect(page.getByTestId('invites-allowance')).toContainText('0 free now');
    const prisma = createE2EPrismaClient();
    const invite = await prisma.invite.findFirstOrThrow({ where: { affiliateUserId: AFFILIATE.id, joinedAt: null }, select: { id: true } }).finally(() => prisma.$disconnect());
    await expect(page.getByTestId(`invites-open-row-${invite.id}`)).toContainText('For my brother');

    const visitor = await browser.newContext();
    const invitePage = await visitor.newPage();
    await invitePage.goto(path);
    await expect(invitePage.getByTestId('valid-invite-heading')).toHaveText(headline ?? '', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await page.getByTestId(`invites-open-cancel-${invite.id}`).click();
    await page.getByTestId(`invites-open-cancel-confirm-${invite.id}`).click();
    await expect(page.getByTestId(`invites-open-row-${invite.id}`)).toHaveCount(0, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('invites-allowance')).toHaveText('1 every 30 days, 1 free now');

    await invitePage.goto(path);
    await expect(invitePage.getByTestId('invalid-invite-heading')).toHaveText("This invite can't be used", { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await visitor.close();
    await page.context().close();
  });

  test('shows who joined, and never why someone left', async ({ browser, baseURL }) => {
    const page = await memberPage(browser, baseURL!, AFFILIATE.id);
    await page.goto('/invites');

    const active = page.getByTestId(`invites-joined-row-${JOINED.active.inviteId}`);
    await expect(active).toContainText(JOINED.active.name, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId(`invites-joined-status-${JOINED.active.inviteId}`)).toHaveText('Active');
    await expect(page.getByTestId(`invites-joined-row-${JOINED.left.inviteId}`)).toContainText(JOINED.left.name);
    await expect(page.getByTestId(`invites-joined-status-${JOINED.left.inviteId}`)).toHaveText('No longer a member');
    await expect(page.getByTestId(`invites-joined-row-${JOINED.removed.inviteId}`)).toContainText('A member who left');
    await expect(page.getByTestId(`invites-joined-status-${JOINED.removed.inviteId}`)).toHaveCount(0);
    await page.context().close();
  });
});
