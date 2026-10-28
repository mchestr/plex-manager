import { TEST_USERS } from '../fixtures/auth';
import {
  clearVisualFixtures,
  seedVisualFixtures,
  setVisualPlexServerUrl,
  VISUAL_INVITE_IDS,
  VISUAL_PLEX_SERVER,
} from '../helpers/seed-fixtures';
import { editSection } from '../helpers/settings';
import { capture, expect, settlePage, skipUnlessProductionBuild, test } from './visual-test';

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

  // P7.8: the season console at 1440x900 and 390x844 (the two viewport projects).
  test('rewind season', async ({ page }) => {
    await capture(page, '/admin/rewind', 'admin-rewind-season');
  });

  test('settings, Rewind section', async ({ page }) => {
    await page.goto('/admin/settings#rewind');
    await settlePage(page);
    // The status line reports this run's Redis and Tautulli
    await expect(page.getByTestId('settings-rewind-section')).toHaveScreenshot('admin-settings-rewind.png', {
      mask: [page.getByTestId('rewind-settings-status')],
    });
  });

  // A section in edit mode: the form in place of its summary, Cancel and Save
  test('settings, editing the Plex server', async ({ page }) => {
    await page.goto('/admin/settings');
    await settlePage(page);
    await editSection(page, 'plex');
    await expect(page.getByTestId('settings-plex-section')).toHaveScreenshot('admin-settings-plex-editing.png', {
      mask: [page.getByTestId(/-timestamp$/)],
    });
  });

  test('invites', async ({ page }) => {
    await capture(page, '/admin/invites', 'admin-invites');
  });

  // P10.1: the filtered empty state and the detail page with its pass preview.
  test('invites, no match', async ({ page }) => {
    await capture(page, '/admin/invites?q=NOMATCH', 'admin-invites-empty-filtered');
  });

  test('invite detail', async ({ page }) => {
    await capture(page, `/admin/invites/${VISUAL_INVITE_IDS.valid}`, 'admin-invite-detail');
  });

  // P10.3: the live page, with its "Updated Ns ago" line and the run-dependent jobs masked.
  test('queues', async ({ page }) => {
    await page.goto('/admin/queues');
    await settlePage(page);
    await expect(page).toHaveScreenshot('admin-queues.png', {
      fullPage: true,
      mask: [page.getByTestId('queue-live-updated'), page.getByTestId('queue-jobs')],
    });
  });

  test('LLM usage', async ({ page }) => {
    await capture(page, '/admin/llm-usage', 'admin-llm-usage');
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
