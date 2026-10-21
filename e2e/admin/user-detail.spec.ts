import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { REWIND_YEAR } from '../helpers/seed-rewind';

/**
 * The user detail page (P10.6): from the users list by keyboard only, switch
 * tabs, regenerate a member whose run has been stuck for 20 minutes through
 * the confirm, and open a stored version's history page and follow its
 * breadcrumb back to the member's Rewind tab.
 */

const MEMBER = { id: 'user-detail-e2e-id', plexUserId: 'user-detail-e2e-plex', name: 'Aaa Detail Member', email: 'user-detail@example.com' };
const USAGE_ID = 'user-detail-e2e-usage';
/**
 * Regenerate refuses without an active Tautulli, and the global seed has none
 * (the visual seed deletes any). Nothing listens here: the eligibility lookup
 * fails open, and the job fails on its own after the dialog has closed.
 */
const TAUTULLI = { id: 'user-detail-e2e-tautulli', name: 'E2E Tautulli', url: 'http://127.0.0.1:9', apiKey: 'e2e-key', isActive: true };
const ARCHIVE_YEAR = REWIND_YEAR - 1;

async function seedMember(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    const row = { ...MEMBER, isAdmin: false, primaryAuthService: 'plex', onboardingStatus: { plex: true, jellyfin: false } };
    await prisma.user.upsert({ where: { id: MEMBER.id }, create: row, update: row });
    await prisma.tautulli.upsert({ where: { id: TAUTULLI.id }, create: TAUTULLI, update: TAUTULLI });
    // Deleting the Rewind rows only unlinks their usage, so each test's seed clears it first
    await prisma.lLMUsage.deleteMany({ where: { userId: MEMBER.id } });
    await prisma.plexWrapped.deleteMany({ where: { userId: MEMBER.id } });
    const stuck = await prisma.plexWrapped.create({ data: { userId: MEMBER.id, year: REWIND_YEAR, status: 'generating', data: '{}' } });
    const startedAt = new Date(Date.now() - 20 * 60_000);
    await prisma.rewindGeneration.create({
      data: { wrappedId: stuck.id, userId: MEMBER.id, year: REWIND_YEAR, kind: 'season', status: 'running', startedAt, createdAt: startedAt },
    });
    const archive = await prisma.plexWrapped.create({
      data: { userId: MEMBER.id, year: ARCHIVE_YEAR, status: 'completed', data: '{}', generatedAt: new Date('2025-12-02T00:00:00Z') },
    });
    await prisma.lLMUsage.create({
      data: {
        id: USAGE_ID,
        userId: MEMBER.id,
        wrappedId: archive.id,
        provider: 'openai',
        model: 'gpt-5-mini',
        prompt: null,
        response: null,
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cost: 0.01,
        createdAt: new Date('2025-12-01T12:00:00Z'),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function clearMember(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lLMUsage.deleteMany({ where: { userId: MEMBER.id } });
    await prisma.user.deleteMany({ where: { id: MEMBER.id } });
    await prisma.tautulli.deleteMany({ where: { id: TAUTULLI.id } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Admin user detail', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(seedMember);
  test.afterAll(clearMember);

  test('opens from the users list by keyboard and switches tabs through the URL', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    // The list starts on "Plex access: Yes", and no seeded member is shared on a live Plex server
    await adminPage.getByTestId('users-filter-plex-access').click();
    await adminPage.getByTestId('users-filter-plex-access-option-all').click();
    const link = adminPage.getByTestId(`user-name-link-${MEMBER.id}`);
    await link.focus();
    await adminPage.keyboard.press('Enter');

    await expect(adminPage).toHaveURL(new RegExp(`/admin/users/${MEMBER.id}$`));
    await expect(adminPage.getByTestId('admin-user-header')).toContainText(MEMBER.name);
    await expect(adminPage.getByTestId('admin-user-rewind-badge')).toContainText('Stuck');

    await adminPage.getByTestId('admin-user-tab-overview').focus();
    await adminPage.keyboard.press('ArrowRight');
    await expect(adminPage).toHaveURL(new RegExp(`/admin/users/${MEMBER.id}\\?tab=rewind$`));
    await expect(adminPage.getByTestId('admin-user-rewind')).toBeVisible();

    await adminPage.keyboard.press('ArrowRight');
    await expect(adminPage).toHaveURL(/tab=usage$/);
    await expect(adminPage.getByTestId('admin-user-usage-stats')).toBeVisible();
  });

  test('regenerates the stuck Rewind through the confirm', async ({ adminPage }) => {
    await adminPage.goto(`/admin/users/${MEMBER.id}?tab=rewind`);
    await adminPage.getByTestId(`admin-user-rewind-actions-${REWIND_YEAR}`).click();
    await adminPage.getByTestId(`admin-user-rewind-actions-${REWIND_YEAR}-regenerate`).click();

    const dialog = adminPage.getByTestId('admin-user-regenerate-dialog');
    await expect(dialog).toContainText(`Regenerate ${MEMBER.name}'s Rewind ${REWIND_YEAR}?`);
    await adminPage.getByTestId('admin-user-regenerate-confirm').click();
    await expect(dialog).toBeHidden();
  });

  test('opens a stored version and follows its breadcrumb back', async ({ adminPage }) => {
    await adminPage.goto(`/admin/users/${MEMBER.id}?tab=rewind`);
    await adminPage.getByTestId(`admin-user-rewind-actions-${ARCHIVE_YEAR}`).click();
    await adminPage.getByTestId(`admin-user-rewind-actions-${ARCHIVE_YEAR}-version-${USAGE_ID}`).click();

    await expect(adminPage).toHaveURL(new RegExp(`/history/${USAGE_ID}$`));
    const crumbs = adminPage.getByTestId('admin-wrapped-history-heading').getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs).toContainText('Version of');
    await crumbs.getByRole('link', { name: `Rewind ${ARCHIVE_YEAR}` }).click();

    await expect(adminPage).toHaveURL(new RegExp(`/admin/users/${MEMBER.id}\\?tab=rewind$`));
    await expect(adminPage.getByTestId('admin-user-rewind')).toBeVisible();
  });
});
