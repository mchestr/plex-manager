import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * The Affiliates page's Settings tab: the switch refuses to go on without a
 * library list, and turning it off cancels an open affiliate invite. The
 * Config fields it changes are put back after the run.
 */

const RUN = `e2e-affiliate-settings-${Date.now()}`;
const AFFILIATE_ID = `${RUN}-affiliate`;
const INVITE_CODE = `${RUN}-INVITE`;

type SavedFields = { affiliateInvitesEnabled: boolean; affiliateLibrarySectionIds: unknown; affiliatePlexMachineId: string | null } | null;
let saved: SavedFields = null;

async function setSwitch(data: { affiliateInvitesEnabled: boolean; affiliateLibrarySectionIds: number[]; affiliatePlexMachineId: string | null }) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.config.upsert({ where: { id: 'config' }, create: { id: 'config', ...data }, update: data });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Admin affiliate settings', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      saved = await prisma.config.findUnique({
        where: { id: 'config' },
        select: { affiliateInvitesEnabled: true, affiliateLibrarySectionIds: true, affiliatePlexMachineId: true },
      });
      await prisma.user.create({
        data: { id: AFFILIATE_ID, name: 'Aaa Settings Affiliate', plexUserId: `${RUN}-plex`, primaryAuthService: 'plex', onboardingStatus: { plex: true, jellyfin: false } },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.invite.deleteMany({ where: { code: INVITE_CODE } });
      await prisma.user.deleteMany({ where: { id: AFFILIATE_ID } });
      await prisma.config.update({
        where: { id: 'config' },
        data: {
          affiliateInvitesEnabled: saved?.affiliateInvitesEnabled ?? false,
          affiliateLibrarySectionIds: (saved?.affiliateLibrarySectionIds as number[] | null) ?? [],
          affiliatePlexMachineId: saved?.affiliatePlexMachineId ?? null,
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('refuses to turn the switch on without libraries', async ({ adminPage }) => {
    await setSwitch({ affiliateInvitesEnabled: false, affiliateLibrarySectionIds: [], affiliatePlexMachineId: null });
    await adminPage.goto('/admin/affiliates?tab=settings');
    await expect(adminPage.getByTestId('settings-affiliates-summary-enabled')).toContainText('Off', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await adminPage.getByTestId('settings-affiliates-edit').click();
    await adminPage.getByTestId('settings-affiliates-switch').click();
    await adminPage.getByTestId('settings-affiliates-save').click();

    await expect(adminPage.getByTestId('settings-affiliates-library-picker-error')).toBeVisible();
    await adminPage.getByTestId('settings-affiliates-cancel').click();
    await adminPage.getByTestId('settings-affiliates-discard-dialog-confirm').click();
    await expect(adminPage.getByTestId('settings-affiliates-summary-enabled')).toContainText('Off');
  });

  test('turning the switch off cancels an open affiliate invite', async ({ adminPage }) => {
    await setSwitch({ affiliateInvitesEnabled: true, affiliateLibrarySectionIds: [1], affiliatePlexMachineId: `${RUN}-machine` });
    const prisma = createE2EPrismaClient();
    try {
      await prisma.invite.create({
        data: {
          code: INVITE_CODE,
          kind: 'AFFILIATE',
          affiliateUserId: AFFILIATE_ID,
          label: 'For my sister',
          maxUses: 1,
          expiresAt: new Date(Date.now() + 48 * 3_600_000),
          librarySectionIds: '[1]',
        },
      });
    } finally {
      await prisma.$disconnect();
    }

    await adminPage.goto('/admin/affiliates?tab=settings');
    await expect(adminPage.getByTestId('settings-affiliates-summary-enabled')).toContainText('On', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await adminPage.getByTestId('settings-affiliates-edit').click();
    await adminPage.getByTestId('settings-affiliates-switch').click();
    await adminPage.getByTestId('settings-affiliates-save').click();
    await expect(adminPage.getByTestId('settings-affiliates-summary-enabled')).toContainText('Off', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    const check = createE2EPrismaClient();
    try {
      const invite = await check.invite.findUniqueOrThrow({ where: { code: INVITE_CODE } });
      expect(invite.cancelledAt).not.toBeNull();
      expect(invite.label).toBeNull();
    } finally {
      await check.$disconnect();
    }
  });
});
