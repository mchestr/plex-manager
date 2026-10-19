import { TEST_USERS } from '../fixtures/auth';
import {
  clearVisualFixtures,
  seedVisualFixtures,
  setVisualPlexServerUrl,
  VISUAL_PLEX_SERVER,
} from '../helpers/seed-fixtures';
import { capture, skipUnlessProductionBuild, test } from './visual-test';

/**
 * Admin and status screens (P1.6): 8 admin screens and 2 status screens per
 * viewport project.
 *
 * The E2E Plex server is unreachable either way, so the two users screens
 * may match today. Both stay: P10.18 adds the Plex-down alert, and the pair
 * shows it working.
 */

skipUnlessProductionBuild();

test.describe('Admin screens', () => {
  test.beforeAll(async () => {
    await seedVisualFixtures();
  });

  test.afterAll(async () => {
    await clearVisualFixtures();
  });

  test.beforeEach(async ({ signIn }) => {
    await signIn(TEST_USERS.ADMIN.id);
  });

  test('users', async ({ page }) => {
    await capture(page, '/admin/users', 'admin-users');
  });

  test.describe('with Plex down', () => {
    test.beforeEach(async () => {
      await setVisualPlexServerUrl(VISUAL_PLEX_SERVER.downUrl);
    });

    test.afterEach(async () => {
      await setVisualPlexServerUrl(VISUAL_PLEX_SERVER.url);
    });

    test('users, Plex down', async ({ page }) => {
      await capture(page, '/admin/users', 'admin-users-plex-down');
    });
  });

  test('user detail', async ({ page }) => {
    await capture(page, `/admin/users/${TEST_USERS.REGULAR.id}`, 'admin-user-detail');
  });

  test('settings', async ({ page }) => {
    await capture(page, '/admin/settings', 'admin-settings');
  });

  test('invites', async ({ page }) => {
    await capture(page, '/admin/invites', 'admin-invites');
  });

  test('queues', async ({ page }) => {
    await capture(page, '/admin/queues', 'admin-queues');
  });

  test('LLM usage', async ({ page }) => {
    await capture(page, '/admin/llm-usage', 'admin-llm-usage');
  });

  test('prompts', async ({ page }) => {
    await capture(page, '/admin/prompts', 'admin-prompts');
  });
});

test.describe('Status screens', () => {
  test('404', async ({ page }) => {
    await capture(page, '/visual-missing-page', 'not-found');
  });

  test('error', async ({ page }) => {
    await capture(page, '/auth/callback/plex', 'error');
  });
});
