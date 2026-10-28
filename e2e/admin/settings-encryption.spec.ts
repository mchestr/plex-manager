import { randomBytes } from 'node:crypto';

import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * P11.1 (SEC-32): a stored Tautulli key that no configured key can read says
 * so in the section's summary, whose "Enter it again" opens the form on an
 * empty, required key field, while the rest of the settings page works.
 *
 * The seed has no Tautulli, so the spec writes one whose key is encrypted
 * under a kid the server does not have (playwright.config.ts gives it `e2e`)
 * and removes it afterwards.
 */

const TAUTULLI_ID = 'e2e-p111-unreadable-tautulli';

test.describe.configure({ mode: 'serial' });

test.describe('Settings: encryption at rest', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.tautulli.deleteMany();
      await prisma.tautulli.create({
        data: {
          id: TAUTULLI_ID,
          name: 'Unreadable Tautulli',
          url: 'http://localhost:8181',
          apiKey: `enc:v2:e2e-lost:${randomBytes(48).toString('base64')}`,
          isActive: true,
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.tautulli.deleteMany({ where: { id: TAUTULLI_ID } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('asks for an unreadable key again while the page works', async ({ adminPage: page }) => {
    await page.goto('/admin/settings#tautulli');

    // The rest of the page still renders
    await expect(page.getByTestId('settings-plex-section')).toBeVisible();

    // Tautulli's summary says the key can't be read, and Test waits for a new one
    await expect(page.getByTestId('settings-tautulli-summary-secret')).toContainText("Can't be read with the current encryption key.");
    await expect(page.getByTestId('settings-tautulli-test')).toBeDisabled();

    // "Enter it again" opens the form on the key field
    await page.getByTestId('settings-tautulli-summary-secret-reenter').click();
    const key = page.getByTestId('settings-tautulli-secret');
    await expect(key).toBeFocused();
    await expect(key).toHaveAttribute('data-state', 'reenter-required');
    await expect(key).toHaveValue('');
    await expect(page.getByTestId('settings-tautulli-secret-unreadable')).toContainText(
      "can't be read with the current encryption key. Enter it again."
    );
    await expect(page.getByTestId('settings-tautulli-save')).toBeDisabled();
  });
});
