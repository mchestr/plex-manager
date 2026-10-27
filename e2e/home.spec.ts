import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The signed-in home (P10.21): headings run h1 then h2, nothing animates
 * forever, the quick links go to the right places, an announcement's "New"
 * pip shows once and is gone after a reload, and long words stay inside a
 * phone screen.
 */

const TITLE = 'E2E Home Pip Announcement';

async function removeAnnouncements() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.announcement.deleteMany({ where: { title: { startsWith: TITLE } } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Home page', () => {
  test.beforeEach(removeAnnouncements);
  test.afterAll(removeAnnouncements);

  test('headings run h1 then h2, with no skipped level', async ({ regularUserPage: page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-greeting')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    const levels = await page
      .getByTestId('home-page')
      .locator('h1, h2, h3, h4')
      .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));

    expect(levels[0]).toBe(1);
    expect(levels.filter((level) => level === 1)).toHaveLength(1);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  test('nothing keeps animating after load', async ({ regularUserPage: page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    // Not networkidle: with Cache Components, the router holds its /help
    // prefetch open while the page sits, so the network never goes idle,
    // and a streamed skeleton may still pulse at load: it must stop, not run on
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document
                .getAnimations()
                .filter((animation) => animation.effect?.getComputedTiming().iterations === Infinity).length
          ),
        { timeout: WAIT_TIMEOUTS.PAGE_CONTENT }
      )
      .toBe(0);
  });

  test('the quick links go to Plex Web, the public request site and /discord/link', async ({ regularUserPage: page }) => {
    await page.goto('/');
    await expect(page.getByTestId('home-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    const media = page.getByTestId('home-quick-link-plex');
    if (await media.count()) {
      await expect(media).toHaveAttribute(
        'href',
        /^https:\/\/app\.plex\.tv\/desktop\/#!\/media\/[A-Za-z0-9-]+\/com\.plexapp\.plugins\.library$|\/web$/
      );
    }
    const discord = page.getByTestId('home-quick-link-discord');
    if (await discord.count()) {
      await expect(discord).toHaveAttribute('href', '/discord/link');
    }
    const requests = page.getByTestId('home-quick-link-requests');
    if (await requests.count()) {
      await expect(requests).toHaveAttribute('href', /^https?:\/\//);
    }
    await expect(page.locator('a[href*="jellyfin.org"]')).toHaveCount(0);
  });

  test('a new announcement pip disappears after a reload', async ({ regularUserPage: page }) => {
    const prisma = createE2EPrismaClient();
    let id: string;
    try {
      const announcement = await prisma.announcement.create({
        data: { title: TITLE, content: 'Pip check', priority: 1000, isActive: true, createdBy: 'admin-user-id' },
      });
      id = announcement.id;
    } finally {
      await prisma.$disconnect();
    }

    // The visit is the write: wait for markAnnouncementsSeen's action to answer
    const marked = page.waitForResponse((response) => response.request().method() === 'POST' && !!response.request().headers()['next-action']);
    await page.goto('/');
    await expect(page.getByTestId(`announcement-${id}-new`)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await marked;

    await page.reload();
    await expect(page.getByTestId(`announcement-${id}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId(`announcement-${id}-new`)).toHaveCount(0);
  });

  test('a long username and an unbroken announcement title never widen a phone screen', async ({ regularUserPage: page }) => {
    const prisma = createE2EPrismaClient();
    try {
      // A Plex username is often an email address: one word, no spaces to wrap at
      await prisma.user.update({ where: { id: TEST_USERS.REGULAR.id }, data: { name: 'christopher.thompson.plexwatcher@example.com' } });
      await prisma.announcement.create({
        data: {
          title: `${TITLE} ${'Unbroken'.repeat(8)}`,
          content: `Details at https://example.com/${'path'.repeat(20)}`,
          priority: 1000,
          isActive: true,
          createdBy: 'admin-user-id',
        },
      });

      await page.setViewportSize({ width: 320, height: 700 });
      await page.goto('/');
      await expect(page.getByTestId('announcements-card')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    } finally {
      await prisma.user.update({ where: { id: TEST_USERS.REGULAR.id }, data: { name: TEST_USERS.REGULAR.name } });
      await prisma.$disconnect();
    }
  });
});
