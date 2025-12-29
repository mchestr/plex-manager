import { expect, test } from './fixtures/test-setup';
import { waitForAdminContent, waitForToast, WAIT_TIMEOUTS } from './helpers/test-utils';
import { createE2EPrismaClient } from './helpers/prisma';

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
    await adminPage.locator('aside').getByTestId('admin-nav-announcements').first().click();
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'Announcements' }
    ], { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
  });

  // Basic functionality test - just verify page loads
  test('should create a new announcement', async ({ adminPage }) => {
    // Wait for page to be stable before navigating
    await adminPage.waitForLoadState('networkidle');
    await adminPage.goto('/admin/announcements');
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'Announcements' }
    ], { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

    // Open create modal
    await adminPage.getByTestId('create-announcement-button').click();
    await expect(adminPage.getByRole('dialog')).toBeVisible({ timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });

    // Fill form
    await adminPage.getByTestId('announcement-title-input').fill('E2E Test Announcement');
    await adminPage.getByTestId('announcement-content-input').fill('This is a test announcement created by E2E tests');
    await adminPage.getByTestId('announcement-priority-input').fill('5');

    // Submit form
    await adminPage.getByTestId('announcement-submit-button').click();

    // Should show success toast
    await waitForToast(adminPage, /created/i, { timeout: WAIT_TIMEOUTS.TOAST_APPEAR });

    // Modal should close
    await expect(adminPage.getByRole('dialog')).not.toBeVisible({ timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });

    // Announcement should appear in list
    await expect(adminPage.getByText('E2E Test Announcement')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
  });

  test('should toggle announcement active status', async ({ adminPage }) => {
    // Create announcement
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
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'Announcements' }
    ], { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

    // Wait for announcement
    const announcementCard = adminPage.getByTestId(`announcement-${announcementId}`);
    await expect(announcementCard).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

    // Should show Active badge initially
    await expect(announcementCard.getByText('Active')).toBeVisible();

    // Click toggle button to deactivate
    await adminPage.getByTestId(`toggle-announcement-${announcementId}`).click();

    // Should show success toast
    await waitForToast(adminPage, /status updated/i, { timeout: WAIT_TIMEOUTS.TOAST_APPEAR });

    // Should now show Inactive badge
    await expect(announcementCard.getByText('Inactive')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
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

      // Ensure regular user has completed onboarding
      await prisma.user.update({
        where: { id: 'regular-user-id' },
        data: {
          onboardingStatus: {
            plex: true,
            jellyfin: true,
            completed: true,
          },
        },
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
    // Create active announcement and ensure user has completed onboarding
    const prisma = createE2EPrismaClient();
    try {
      // Ensure regular user has completed onboarding first
      await prisma.user.update({
        where: { id: 'regular-user-id' },
        data: {
          onboardingStatus: {
            plex: true,
            jellyfin: true,
            completed: true,
          },
        },
      });

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

    // Go to home page and wait for content
    await regularUserPage.goto('/');
    await regularUserPage.waitForLoadState('networkidle');

    // Announcement card should be visible (use extended timeout for data fetching)
    await expect(regularUserPage.getByTestId('announcements-card')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(regularUserPage.getByText('E2E Dashboard Active Announcement')).toBeVisible();
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
      // Ensure regular user has completed onboarding first
      await prisma.user.update({
        where: { id: 'regular-user-id' },
        data: {
          onboardingStatus: {
            plex: true,
            jellyfin: true,
            completed: true,
          },
        },
      });

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

    // Go to home page and wait for content
    await regularUserPage.goto('/');
    await regularUserPage.waitForLoadState('networkidle');

    // Wait for announcements to be visible (use extended timeout for data fetching)
    await expect(regularUserPage.getByTestId('announcements-card')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

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
