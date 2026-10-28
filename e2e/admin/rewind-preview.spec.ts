import heavy from '../fixtures/rewind/heavy.v3.json';
import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { REWIND_YEAR, seedRewindIssue } from '../helpers/seed-rewind';

/**
 * The admin Rewind preview (P7.9): Preview from the season console opens the
 * member's Rewind with the admin nav still there, an old `/wrapped?year=`
 * link lands on the year in the path, and Roll back through its confirm
 * restores the earlier version, which changes the status badge.
 *
 * The member's 2026 row failed after an earlier completed run, which kept
 * the heavy issue in `previousData`. The full screen and share tests store the
 * heavy issue as the member's completed Rewind instead.
 */

const MEMBER = { id: 'rewind-preview-user-id', plexUserId: 'rewind-preview-plex-id', name: 'Aaa Preview Member', email: 'rewind-preview@example.com' };

async function seedMember(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    const row = { ...MEMBER, isAdmin: false, primaryAuthService: 'plex' as const, onboardingStatus: { plex: true, jellyfin: false } };
    await prisma.user.upsert({ where: { id: MEMBER.id }, create: row, update: row });
    await prisma.plexWrapped.deleteMany({ where: { userId: MEMBER.id } });
    const wrapped = await prisma.plexWrapped.create({
      data: { userId: MEMBER.id, year: REWIND_YEAR, status: 'failed', error: JSON.stringify({ code: 'UPSTREAM_ERROR' }), data: '{}' },
    });
    const base = { wrappedId: wrapped.id, userId: MEMBER.id, year: REWIND_YEAR, kind: 'admin' };
    await prisma.rewindGeneration.create({
      data: { ...base, status: 'completed', previousData: JSON.stringify(heavy), finishedAt: new Date('2026-11-20T10:00:00Z'), createdAt: new Date('2026-11-20T09:59:00Z') },
    });
    await prisma.rewindGeneration.create({
      data: { ...base, status: 'failed', error: { code: 'UPSTREAM_ERROR' }, finishedAt: new Date('2026-11-21T10:00:00Z'), createdAt: new Date('2026-11-21T09:59:00Z') },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function clearMember(): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.user.deleteMany({ where: { id: MEMBER.id } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Admin Rewind preview', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(seedMember);
  test.afterAll(clearMember);

  test('Preview from the season console opens the member\'s 2026 Rewind with the admin nav', async ({ adminPage }) => {
    await adminPage.goto('/admin/rewind');
    await adminPage.getByTestId(`admin-rewind-members-actions-${MEMBER.id}`).first().click();
    await adminPage.getByTestId(`admin-rewind-members-actions-${MEMBER.id}-preview`).click();

    await expect(adminPage).toHaveURL(new RegExp(`/admin/users/${MEMBER.id}/rewind/${REWIND_YEAR}$`));
    await expect(adminPage.getByTestId('admin-rewind-preview-header')).toBeVisible();
    await expect(adminPage.getByTestId('admin-rewind-preview-banner')).toContainText('as an admin');
    await expect(adminPage.getByTestId('admin-sidebar')).toBeVisible();
    await expect(adminPage.getByTestId('admin-rewind-preview-code')).toHaveText('UPSTREAM_ERROR');
  });

  test('an old /wrapped?year= link lands on the year in the path', async ({ adminPage }) => {
    await adminPage.goto(`/admin/users/${MEMBER.id}/wrapped?year=2025`);
    await expect(adminPage).toHaveURL(new RegExp(`/admin/users/${MEMBER.id}/rewind/2025$`));
    await expect(adminPage.getByTestId('admin-rewind-preview-header')).toBeVisible();
  });

  test('Roll back through the dialog restores the earlier version', async ({ adminPage }) => {
    await adminPage.goto(`/admin/users/${MEMBER.id}/rewind/${REWIND_YEAR}`);
    const header = adminPage.getByTestId('admin-rewind-preview-header');
    await expect(header).toContainText("Couldn't finish");

    await adminPage.getByTestId('admin-rewind-preview-rollback').click();
    await expect(adminPage.getByTestId('admin-rewind-rollback-dialog')).toContainText('the version from');
    await adminPage.getByTestId('admin-rewind-rollback-confirm').click();

    await expect(header).toContainText('Ready to watch');
    await expect(adminPage.getByTestId('admin-rewind-preview-frame')).toBeVisible();
  });

  test('Full screen lifts the story out of its frame, keeps the cover inside the frame before, and Esc puts it back', async ({ adminPage }) => {
    await seedRewindIssue(MEMBER.id, 'heavy');
    await adminPage.goto(`/admin/users/${MEMBER.id}/rewind/${REWIND_YEAR}`);
    const frame = adminPage.getByTestId('admin-rewind-preview-frame');
    const stage = adminPage.getByTestId('rewind-stage');
    await expect(stage).toHaveAttribute('data-fitted');
    await expect(adminPage.getByTestId('rewind-article-offer')).toHaveCount(0);

    // The cover's fixed field layer stays inside the frame, not over the admin page.
    const frameBox = await frame.boundingBox();
    const fieldBox = await adminPage.getByTestId('rewind-cover-field').boundingBox();
    expect(fieldBox?.width).toBeLessThanOrEqual((frameBox?.width ?? 0) + 1);
    expect(fieldBox?.height).toBeLessThanOrEqual((frameBox?.height ?? 0) + 1);

    await adminPage.getByTestId('rewind-fullscreen').click();
    await expect(stage).toHaveAttribute('data-fullscreen');
    await expect(adminPage.getByTestId('rewind-fullscreen')).toHaveAccessibleName('Exit full screen');
    const viewport = adminPage.viewportSize();
    const stageBox = await stage.boundingBox();
    expect(stageBox?.width).toBe(viewport?.width);
    expect(stageBox?.height).toBe(viewport?.height);

    await stage.focus();
    await adminPage.keyboard.press('Escape');
    await expect(stage).not.toHaveAttribute('data-fullscreen');
    await expect(adminPage).toHaveURL(new RegExp(`/admin/users/${MEMBER.id}/rewind/${REWIND_YEAR}$`));
    await expect(frame).toContainText('Cover');
  });

  test('Share the poster in the preview says that sharing is off', async ({ adminPage }) => {
    await seedRewindIssue(MEMBER.id, 'heavy');
    await adminPage.goto(`/admin/users/${MEMBER.id}/rewind/${REWIND_YEAR}`);
    const stage = adminPage.getByTestId('rewind-stage');
    await expect(stage).toHaveAttribute('data-fitted');
    await stage.focus();
    await adminPage.keyboard.press('End');
    await adminPage.getByTestId('rewind-back-cover-share').click();

    await expect(adminPage.getByTestId('rewind-share-off')).toContainText('Sharing is off in this preview.');
    // Someone else's Rewind: no link to the admin's own.
    await expect(adminPage.getByTestId('rewind-share-off-open')).toHaveCount(0);
  });
});
