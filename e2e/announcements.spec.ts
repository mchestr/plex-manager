import { expect, test } from './fixtures/auth';
import { waitForToast, WAIT_TIMEOUTS } from './helpers/test-utils';
import { createE2EPrismaClient } from './helpers/prisma';

/** The id of the announcement the admin just created, so its row is found by test id. */
async function findAnnouncementId(title: string): Promise<string> {
  const prisma = createE2EPrismaClient();
  try {
    const row = await prisma.announcement.findFirstOrThrow({ where: { title }, select: { id: true } });
    return row.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Announcements Admin', () => {
  // Clean up test announcements before each test
  test.beforeEach(async () => {
    const prisma = createE2EPrismaClient();
    try {
      // Delete all test announcements (those created by e2e tests)
      await prisma.announcement.deleteMany({
        where: {
          title: { contains: 'E2E Test' }
        }
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  // Clean up after all tests
  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.announcement.deleteMany({
        where: {
          title: { contains: 'E2E Test' }
        }
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('should access announcements admin page', async ({ adminPage }) => {
    await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-announcements').first().click();
    await expect(adminPage.getByTestId('admin-announcements-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
  });

  test('creates one with a list, previews the bullets, and shows them on home', async ({ adminPage }) => {
    await adminPage.goto('/admin/announcements');
    await expect(adminPage.getByTestId('admin-announcements-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

    await adminPage.getByTestId('create-announcement-button').click();
    await expect(adminPage.getByTestId('announcement-dialog')).toBeVisible({ timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });

    await adminPage.getByTestId('announcement-title-input').fill('E2E Test Announcement');
    await adminPage.getByTestId('announcement-content-input').fill('Tonight:\n\n- Plex restarts\n- Disks swap');
    await adminPage.getByTestId('announcement-priority-input').fill('5');

    // The live preview renders the list as home will
    const preview = adminPage.getByTestId('announcement-preview-item');
    await expect(preview.locator('li')).toHaveCount(2);
    await expect(preview.getByText('New')).toBeAttached();

    await adminPage.getByTestId('announcement-submit-button').click();
    await waitForToast(adminPage, /created/i, { timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(adminPage.getByTestId('announcement-dialog')).not.toBeVisible({ timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });

    const created = await findAnnouncementId('E2E Test Announcement');
    await expect(adminPage.getByTestId(`admin-announcements-row-${created}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

    await adminPage.goto('/');
    const card = adminPage.getByTestId('announcements-card').filter({ visible: true });
    await expect(card.getByText('E2E Test Announcement')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(card.locator('li').filter({ hasText: 'Plex restarts' })).toHaveCount(1);
  });

  test('hides one with the switch, then deletes it through the confirm', async ({ adminPage }) => {
    const prisma = createE2EPrismaClient();
    let announcementId: string;
    try {
      const announcement = await prisma.announcement.create({
        data: {
          title: 'E2E Test Toggle Announcement',
          content: 'Content for toggle test',
          priority: 0,
          isActive: true,
          createdBy: 'admin-user-id',
        }
      });
      announcementId = announcement.id;
    } finally {
      await prisma.$disconnect();
    }

    await adminPage.goto('/admin/announcements');
    const row = adminPage.getByTestId(`admin-announcements-row-${announcementId}`);
    await expect(row).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(adminPage.getByTestId(`announcement-status-${announcementId}`)).toHaveText('Active');

    const toggle = adminPage.getByTestId(`toggle-announcement-${announcementId}`);
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await waitForToast(adminPage, /is hidden/i, { timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(adminPage.getByTestId(`announcement-status-${announcementId}`)).toHaveText('Hidden', { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

    await adminPage.getByTestId(`admin-announcements-actions-${announcementId}`).click();
    await adminPage.getByTestId(`admin-announcements-actions-${announcementId}-delete`).click();
    const dialog = adminPage.getByTestId('announcement-delete-dialog');
    await expect(dialog).toContainText("Delete the announcement 'E2E Test Toggle Announcement'?");
    await adminPage.getByTestId('announcement-delete-confirm').click();
    await waitForToast(adminPage, /deleted/i, { timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(row).toHaveCount(0, { timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
  });
});

test.describe('Announcements User Dashboard', () => {
  test.beforeEach(async () => {
    const prisma = createE2EPrismaClient();
    try {
      // Clean up test announcements
      await prisma.announcement.deleteMany({
        where: {
          title: { contains: 'E2E Dashboard' }
        }
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.announcement.deleteMany({
        where: {
          title: { contains: 'E2E Dashboard' }
        }
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('should display active announcements on home page', async ({ regularUserPage }) => {
    // Create active announcement
    const prisma = createE2EPrismaClient();
    try {
      await prisma.announcement.create({
        data: {
          title: 'E2E Dashboard Active Announcement',
          content: 'This announcement should be visible',
          priority: 0,
          isActive: true,
          createdBy: 'admin-user-id',
        }
      });
    } finally {
      await prisma.$disconnect();
    }

    // Go to home page
    await regularUserPage.goto('/');
    await regularUserPage.waitForLoadState('networkidle');

    // Announcement card should be visible
    await expect(regularUserPage.getByTestId('announcements-card')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(regularUserPage.getByText('E2E Dashboard Active Announcement')).toBeVisible();
  });

  test('renders announcement Markdown safely: bullets, no image, no javascript: link', async ({ regularUserPage }) => {
    const prisma = createE2EPrismaClient();
    let announcementId: string;
    try {
      const announcement = await prisma.announcement.create({
        data: {
          title: 'E2E Dashboard Markdown Announcement',
          content: 'Tonight:\n\n- Plex restarts\n- Disks swap\n\n![x](https://attacker.invalid/?d=1)\n\n[click me](javascript:alert(1))',
          priority: 0,
          isActive: true,
          createdBy: 'admin-user-id',
        }
      });
      announcementId = announcement.id;
    } finally {
      await prisma.$disconnect();
    }

    await regularUserPage.goto('/');
    // The home page renders the card in both its phone and desktop layouts.
    const item = regularUserPage.getByTestId(`announcement-${announcementId}`).filter({ visible: true });
    await expect(item).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await expect(item.locator('li')).toHaveCount(2);
    await expect(item.locator('li').first()).toHaveCSS('list-style-type', 'disc');
    await expect(item.locator('img')).toHaveCount(0);
    await expect(item.locator('a')).toHaveCount(0);
  });

  test('should hide expired announcements on home page', async ({ regularUserPage }) => {
    // Create expired announcement
    const prisma = createE2EPrismaClient();
    try {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      await prisma.announcement.create({
        data: {
          title: 'E2E Dashboard Expired Announcement',
          content: 'This announcement should NOT be visible',
          priority: 0,
          isActive: true,
          expiresAt: pastDate,
          createdBy: 'admin-user-id',
        }
      });
    } finally {
      await prisma.$disconnect();
    }

    // Go to home page
    await regularUserPage.goto('/');
    await regularUserPage.waitForLoadState('networkidle');

    // Expired announcement should NOT be visible
    await expect(regularUserPage.getByText('E2E Dashboard Expired Announcement')).not.toBeVisible({ timeout: WAIT_TIMEOUTS.SHORT_CHECK });
  });

  test('should hide inactive announcements on home page', async ({ regularUserPage }) => {
    // Create inactive announcement
    const prisma = createE2EPrismaClient();
    try {
      await prisma.announcement.create({
        data: {
          title: 'E2E Dashboard Inactive Announcement',
          content: 'This announcement should NOT be visible',
          priority: 0,
          isActive: false,
          createdBy: 'admin-user-id',
        }
      });
    } finally {
      await prisma.$disconnect();
    }

    // Go to home page
    await regularUserPage.goto('/');
    await regularUserPage.waitForLoadState('networkidle');

    // Inactive announcement should NOT be visible
    await expect(regularUserPage.getByText('E2E Dashboard Inactive Announcement')).not.toBeVisible({ timeout: WAIT_TIMEOUTS.SHORT_CHECK });
  });

  test('should sort announcements by priority (higher priority first)', async ({ regularUserPage }) => {
    // Create announcements with different priorities
    const prisma = createE2EPrismaClient();
    try {
      await prisma.announcement.create({
        data: {
          title: 'E2E Dashboard Low Priority',
          content: 'Low priority announcement',
          priority: 1,
          isActive: true,
          createdBy: 'admin-user-id',
        }
      });
      await prisma.announcement.create({
        data: {
          title: 'E2E Dashboard High Priority',
          content: 'High priority announcement',
          priority: 10,
          isActive: true,
          createdBy: 'admin-user-id',
        }
      });
      await prisma.announcement.create({
        data: {
          title: 'E2E Dashboard Medium Priority',
          content: 'Medium priority announcement',
          priority: 5,
          isActive: true,
          createdBy: 'admin-user-id',
        }
      });
    } finally {
      await prisma.$disconnect();
    }

    // Go to home page
    await regularUserPage.goto('/');
    await regularUserPage.waitForLoadState('networkidle');

    // Wait for announcements to be visible
    await expect(regularUserPage.getByTestId('announcements-card')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    // Get all announcement titles in order
    const announcementsCard = regularUserPage.getByTestId('announcements-card');
    const articles = announcementsCard.locator('article');

    // Wait for articles to load
    await expect(articles.first()).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    const count = await articles.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Verify order by checking the first article contains high priority
    const firstArticleText = await articles.first().textContent();
    expect(firstArticleText).toContain('E2E Dashboard High Priority');
  });
});
