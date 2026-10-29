import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * The admin Affiliates page, with its rows seeded directly: refuse an
 * application with a reason, set an affiliate's invites to 0 and clear it,
 * revoke an affiliate (their open invite stops working), and unblock a Plex
 * account from the History tab.
 */

const RUN = `e2e-affiliates-${Date.now()}`;
const APPLICANT = { id: `${RUN}-applicant`, name: 'Aaa Applicant' };
const AFFILIATE = { id: `${RUN}-affiliate`, name: 'Aaa Affiliate' };
const BLOCK_ID = `${RUN}-block`;
const INVITE_CODE = `${RUN}-INVITE`;

let applicationId = '';
let affiliateApplicationId = '';

test.describe.serial('Admin affiliates', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      for (const [index, member] of [APPLICANT, AFFILIATE].entries()) {
        await prisma.user.create({
          data: {
            ...member,
            plexUserId: `${RUN}-plex-${index}`,
            primaryAuthService: 'plex',
            onboardingStatus: { plex: true, jellyfin: false },
            watchHours: 250,
            watchHoursLast30Days: 20,
            watchHoursReadAt: new Date(),
          },
        });
      }
      applicationId = (
        await prisma.affiliateApplication.create({
          data: { userId: APPLICANT.id, openUserId: APPLICANT.id, status: 'PENDING', note: 'I share with family', hoursAtApply: 250 },
        })
      ).id;
      affiliateApplicationId = (
        await prisma.affiliateApplication.create({
          data: { userId: AFFILIATE.id, openUserId: AFFILIATE.id, status: 'APPROVED', hoursAtApply: 250, decidedAt: new Date(), tierIndex: 1 },
        })
      ).id;
      await prisma.invite.create({
        data: {
          code: INVITE_CODE,
          kind: 'AFFILIATE',
          affiliateUserId: AFFILIATE.id,
          label: 'For my brother',
          maxUses: 1,
          expiresAt: new Date(Date.now() + 48 * 3_600_000),
          librarySectionIds: '[1]',
        },
      });
      await prisma.affiliateBlock.create({ data: { id: BLOCK_ID, plexIdHash: `${RUN}`.padEnd(64, '0'), createdBy: 'admin-user-id' } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.invite.deleteMany({ where: { code: INVITE_CODE } });
      await prisma.affiliateBlock.deleteMany({ where: { id: BLOCK_ID } });
      await prisma.user.deleteMany({ where: { id: { in: [APPLICANT.id, AFFILIATE.id] } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('refuses an application with a reason, which History then shows', async ({ adminPage }) => {
    await adminPage.goto('/admin/affiliates');
    await expect(adminPage.getByTestId(`admin-affiliates-applications-row-${applicationId}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await adminPage.getByTestId(`admin-affiliates-refuse-${applicationId}`).click();
    await adminPage.getByTestId('admin-affiliates-refuse-reason').fill('Watch a little more first');
    await adminPage.getByTestId('admin-affiliates-refuse-confirm').click();
    await expect(adminPage.getByTestId(`admin-affiliates-applications-row-${applicationId}`)).toHaveCount(0);

    await adminPage.getByTestId('admin-affiliates-tab-history').click();
    await expect(adminPage.getByTestId(`admin-affiliates-history-row-${applicationId}`)).toContainText('Watch a little more first');
  });

  test('sets an affiliate to 0 invites, then clears it back to the tiers', async ({ adminPage }) => {
    await adminPage.goto('/admin/affiliates?tab=affiliates');
    const state = adminPage.getByTestId(`admin-affiliates-state-${affiliateApplicationId}`);
    await expect(state).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await adminPage.getByTestId(`admin-affiliates-override-${affiliateApplicationId}`).click();
    await adminPage.getByTestId('admin-affiliates-override-input').fill('0');
    await adminPage.getByTestId('admin-affiliates-override-confirm').click();
    await expect(state).toContainText('Paused (0 invites)');
    await expect(adminPage.getByTestId(`admin-affiliates-allowance-${affiliateApplicationId}`)).toContainText('Set by an admin');
    await expect(adminPage.getByTestId('admin-affiliates-override-dialog')).toHaveCount(0);

    await adminPage.getByTestId(`admin-affiliates-override-${affiliateApplicationId}`).click();
    await adminPage.getByTestId('admin-affiliates-override-clear').click();
    await adminPage.getByTestId('admin-affiliates-override-confirm').click();
    await expect(adminPage.getByTestId(`admin-affiliates-allowance-${affiliateApplicationId}`)).toContainText('From their tier');
    await expect(state).toContainText('Active');
  });

  test('revokes an affiliate, which cancels their open invite', async ({ adminPage }) => {
    await adminPage.goto('/admin/affiliates?tab=affiliates');
    await adminPage.getByTestId(`admin-affiliates-invites-${affiliateApplicationId}`).click();
    await expect(adminPage.getByTestId(`admin-affiliates-invites-${affiliateApplicationId}-dialog`)).toContainText('For my brother');
    await adminPage.keyboard.press('Escape');

    await adminPage.getByTestId(`admin-affiliates-revoke-${affiliateApplicationId}`).click();
    await adminPage.getByTestId('admin-affiliates-revoke-reason').fill('Sold invites');
    await adminPage.getByTestId('admin-affiliates-revoke-confirm').click();
    await expect(adminPage.getByTestId(`admin-affiliates-affiliates-row-${affiliateApplicationId}`)).toHaveCount(0);

    const prisma = createE2EPrismaClient();
    try {
      const invite = await prisma.invite.findUniqueOrThrow({ where: { code: INVITE_CODE } });
      expect(invite.cancelledAt).not.toBeNull();
      expect(invite.label).toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });

  test('unblocks a Plex account from History', async ({ adminPage }) => {
    await adminPage.goto('/admin/affiliates?tab=history');
    await expect(adminPage.getByTestId(`admin-affiliates-blocks-row-${BLOCK_ID}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await adminPage.getByTestId(`admin-affiliates-unblock-${BLOCK_ID}`).click();
    await adminPage.getByTestId('admin-affiliates-unblock-confirm').click();
    await expect(adminPage.getByTestId(`admin-affiliates-blocks-row-${BLOCK_ID}`)).toHaveCount(0);
  });
});
