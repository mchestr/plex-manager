import { axeFor } from '../a11y/scan';
import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * The users list (P10.18), the reference admin list page: with Plex at a
 * dead address every member is still listed as Unknown under the Plex-down
 * Alert, a filter change lands in the URL with a chip, and Make admin and
 * Disable run from a row's action menu through their confirms (UI-46).
 *
 * The layout follows the table's own width: cards of labelled fields up to
 * the 984px a 1280 window leaves it, then the table, with Rewind from 1440.
 * Neither the page nor the table scrolls sideways, before hydration either.
 */

const MEMBER = { id: 'users-list-e2e-id', plexUserId: 'users-list-e2e-plex', name: 'Aaa Users Member', email: 'users-list@example.com' };
const DEAD_PLEX = 'http://127.0.0.1:9';

let plexUrl: { id: string; url: string } | null = null;

test.describe('Admin users list', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      const row = { ...MEMBER, isAdmin: false, disabledAt: null, primaryAuthService: 'plex' as const, onboardingStatus: { plex: true, jellyfin: false } };
      await prisma.user.upsert({ where: { id: MEMBER.id }, create: row, update: row });
      const server = await prisma.plexServer.findFirst({ where: { isActive: true }, select: { id: true, url: true } });
      if (server) {
        plexUrl = server;
        await prisma.plexServer.update({ where: { id: server.id }, data: { url: DEAD_PLEX } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      if (plexUrl) await prisma.plexServer.update({ where: { id: plexUrl.id }, data: { url: plexUrl.url } });
      await prisma.user.deleteMany({ where: { id: MEMBER.id } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('lists every member as Unknown under the Plex-down Alert', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');

    await expect(adminPage.getByTestId('admin-users-plex-alert')).toContainText("Plex didn't respond");
    await expect(adminPage.getByTestId('admin-users-stats')).toBeVisible();
    await expect(adminPage.getByTestId(`admin-users-row-${MEMBER.id}`)).toBeVisible();
    await expect(adminPage.getByTestId(`admin-users-plex-${MEMBER.id}`)).toContainText('Unknown');
    await expect(adminPage.getByTestId('admin-users-pagination-info')).toContainText('Showing all');
  });

  test('a filter change updates the URL and shows a chip', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    await adminPage.getByTestId('admin-users-filters-filter-plexAccess').click();
    await adminPage.getByTestId('admin-users-filters-filter-plexAccess-option-unknown').click();

    await expect(adminPage).toHaveURL(/plexAccess=unknown/);
    await expect(adminPage.getByTestId('admin-users-filters-chip-plexAccess')).toContainText('Plex access: Unknown');
    await expect(adminPage.getByTestId(`admin-users-row-${MEMBER.id}`)).toBeVisible();
  });

  test('makes a member an admin through the row menu and its confirm', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    await adminPage.getByTestId(`admin-users-actions-${MEMBER.id}`).click();
    await adminPage.getByTestId(`admin-users-actions-${MEMBER.id}-role`).click();

    const dialog = adminPage.getByTestId('admin-user-role-dialog');
    await expect(dialog).toContainText(`Make ${MEMBER.name} an admin?`);
    await adminPage.getByTestId('admin-user-role-confirm').click();
    await expect(dialog).toBeHidden();

    const prisma = createE2EPrismaClient();
    try {
      await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: MEMBER.id } })).isAdmin).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
    // The refreshed row now offers to take the role away
    await adminPage.getByTestId(`admin-users-actions-${MEMBER.id}`).click();
    await expect(adminPage.getByTestId(`admin-users-actions-${MEMBER.id}-role`)).toContainText('Remove admin role');
    await adminPage.keyboard.press('Escape');
  });

  test('disables a member through the row menu and its confirm', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    await adminPage.getByTestId(`admin-users-actions-${MEMBER.id}`).click();
    await adminPage.getByTestId('admin-user-disable-button').click();

    const dialog = adminPage.getByTestId('admin-user-disable-dialog');
    await expect(dialog).toContainText(`Disable ${MEMBER.name}'s account?`);
    await adminPage.getByTestId('admin-user-disable-confirm').click();
    await expect(dialog).toBeHidden();

    // The refreshed row now offers Enable instead
    await adminPage.getByTestId(`admin-users-actions-${MEMBER.id}`).click();
    await expect(adminPage.getByTestId('admin-user-disable-button')).toContainText('Enable account');
  });
});

const LONG = {
  id: 'users-layout-e2e-id',
  plexUserId: 'users-layout-e2e-plex',
  name: 'Jordan Smith-Wellington',
  email: 'users-layout-e2e.jordan.smith-wellington@fastmail.example',
};

const LAYOUTS = [
  { width: 320, cards: true },
  { width: 390, cards: true },
  { width: 768, cards: true },
  { width: 1024, cards: true },
  { width: 1280, cards: false, rewind: false },
  { width: 1440, cards: false, rewind: true },
];

test.describe('Admin users list layout', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      const row = { ...LONG, isAdmin: false, disabledAt: null, primaryAuthService: 'plex' as const, onboardingStatus: { plex: true, jellyfin: false } };
      await prisma.user.upsert({ where: { id: LONG.id }, create: row, update: row });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.deleteMany({ where: { id: LONG.id } });
    } finally {
      await prisma.$disconnect();
    }
  });

  for (const { width, cards, rewind } of LAYOUTS) {
    test(`at ${width}px the rows are ${cards ? 'cards' : 'a table'} and nothing scrolls sideways`, async ({ adminPage }) => {
      await adminPage.setViewportSize({ width, height: 900 });
      await adminPage.goto('/admin/users');

      await expect(adminPage.getByTestId(`admin-users-row-${LONG.id}`)).toHaveCSS('display', cards ? 'grid' : 'table-row');
      if (cards) {
        await expect(adminPage.getByTestId('admin-users-column-name')).toBeHidden();
        await expect(adminPage.getByTestId('admin-users-filters-filter-role')).toBeHidden();
        await expect(adminPage.getByTestId('admin-users-filters-sort')).toBeVisible();
      } else {
        await expect(adminPage.getByTestId('admin-users-column-name')).toBeVisible();
        await expect(adminPage.getByTestId('admin-users-filters-filter-role')).toBeVisible();
        await expect(adminPage.getByTestId('admin-users-filters-sort')).toBeHidden();
        await expect(adminPage.getByTestId('admin-users-column-rewind')).toBeVisible({ visible: rewind });
      }

      const overflow = await adminPage.evaluate(() => {
        const scroll = document.querySelector('[data-testid="admin-users-scroll"]');
        return {
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          table: scroll ? scroll.scrollWidth - scroll.clientWidth : null,
        };
      });
      expect(overflow).toEqual({ page: 0, table: 0 });
    });
  }

  test('at 390px a card keeps a tappable actions button and has no axe violations', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.goto('/admin/users');

    const actions = await adminPage.getByTestId(`admin-users-actions-${LONG.id}`).boundingBox();
    expect(actions?.width).toBeGreaterThanOrEqual(24);
    expect(actions?.height).toBeGreaterThanOrEqual(24);
    const results = await axeFor(adminPage).include('[data-testid="admin-users"]').analyze();
    expect(results.violations).toEqual([]);
  });

  // Blocking the app's script chunks holds the page before hydration: Next's
  // inline scripts still reveal the streamed HTML, but React never hydrates.
  test('a phone gets the cards before hydration', async ({ adminPage, browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: await adminPage.context().storageState(),
    });
    try {
      const page = await context.newPage();
      await page.route('**/_next/static/chunks/**/*.js', (route) => route.abort());
      await page.goto(new URL('/admin/users', test.info().project.use.baseURL).toString());
      await expect(page.getByTestId(`admin-users-row-${LONG.id}`)).toHaveCSS('display', 'grid');
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBe(390);
    } finally {
      await context.close();
    }
  });
});
