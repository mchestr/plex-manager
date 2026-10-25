import { TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { resetStripeState, setStripeEnabled } from '../helpers/stripe';
import { clearVisualFixtures, seedVisualFixtures, VISUAL_INVITES, VISUAL_ONBOARDING_USER } from '../helpers/seed-fixtures';
import { settle } from '../helpers/deterministic';
import { capture, expectScreen, skipUnlessProductionBuild, test } from './visual-test';

/**
 * Member and public screens (P1.6, P10.22): 12 screens per viewport project.
 */

skipUnlessProductionBuild();

test.describe('Member and public screens', () => {
  test.beforeAll(async () => {
    await seedVisualFixtures();
  });

  test.afterAll(async () => {
    await clearVisualFixtures();
  });

  test('sign-in', async ({ page }) => {
    await capture(page, '/', 'sign-in');
  });

  test('home', async ({ page, signIn }) => {
    await signIn(TEST_USERS.REGULAR.id);
    await capture(page, '/', 'home');
  });

  test('onboarding step 2', async ({ page, signIn }) => {
    await signIn(VISUAL_ONBOARDING_USER.id);
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
    await settle(page);
    await page.getByTestId('onboarding-welcome-continue').click();
    await expectScreen(page, 'onboarding-step-2');
  });

  test('invite, valid', async ({ page }) => {
    await capture(page, `/invite/${VISUAL_INVITES.valid}`, 'invite-valid');
  });

  test('invite, expired', async ({ page }) => {
    await capture(page, `/invite/${VISUAL_INVITES.expired}`, 'invite-expired');
  });

  test.describe('subscribe', () => {
    test.afterAll(async () => {
      await resetStripeState([TEST_USERS.REGULAR.id]);
    });

    test('subscribe', async ({ page, signIn }) => {
      await setStripeEnabled(true, { configure: true });
      await signIn(TEST_USERS.REGULAR.id);
      await capture(page, '/subscribe', 'subscribe');
    });
  });

  test('discord link', async ({ page, signIn }) => {
    await signIn(TEST_USERS.REGULAR.id);
    await capture(page, '/discord/link', 'discord-link');
  });

  test('account', async ({ page, signIn }) => {
    await signIn(TEST_USERS.REGULAR.id);
    await capture(page, '/account', 'account');
  });

  test('help', async ({ page, signIn }) => {
    await signIn(TEST_USERS.REGULAR.id);
    await capture(page, '/help', 'help');
  });

  test('announcements', async ({ page, signIn }) => {
    await signIn(TEST_USERS.REGULAR.id);
    await capture(page, '/announcements', 'announcements');
  });

  test.describe('membership', () => {
    test.afterAll(async () => {
      await resetStripeState([TEST_USERS.REGULAR.id]);
    });

    test('membership, exempt', async ({ page, signIn }) => {
      await setStripeEnabled(true, { configure: true });
      const prisma = createE2EPrismaClient();
      try {
        await prisma.user.update({ where: { id: TEST_USERS.REGULAR.id }, data: { isExempt: true } });
      } finally {
        await prisma.$disconnect();
      }
      await signIn(TEST_USERS.REGULAR.id);
      await capture(page, '/membership', 'membership');
    });
  });

  test('access denied', async ({ page }) => {
    await capture(page, '/auth/denied', 'auth-denied');
  });

  test('stored v2 Rewind', async ({ page, signIn }) => {
    await signIn(TEST_USERS.REGULAR.id);
    await capture(page, '/rewind', 'rewind-v2');
  });
});
