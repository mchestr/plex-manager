import globalSetup from './global-setup';
import { A11Y_SETUP_ROUTES, setupRouteName } from './a11y/routes';
import { scanAgainstBaseline } from './a11y/scan';
import { createE2EPrismaClient } from './helpers/prisma';
import { clearVisualFixtures, seedVisualFixtures } from './helpers/seed-fixtures';
import { claimSetup } from './helpers/setup-claim';
import { expect, settlePage, test } from './visual/visual-test';

/**
 * axe on the setup wizard (P1.7), against the same baseline as
 * `accessibility.spec.ts`. Reopening setup sends every other page to /setup,
 * so this runs in the `setup-wizard` project and restores the seed the way
 * setup-wizard.spec.ts does.
 */

test.describe('Accessibility: setup wizard', () => {
  test.beforeAll(async () => {
    await seedVisualFixtures();
  });

  test.afterAll(async () => {
    await clearVisualFixtures();
    await globalSetup();
  });

  for (const route of A11Y_SETUP_ROUTES) {
    test(setupRouteName(route), async ({ page }) => {
      const prisma = createE2EPrismaClient();
      try {
        await prisma.setup.deleteMany();
        await prisma.setup.create({ data: { isComplete: false, currentStepId: route.stepId } });
      } finally {
        await prisma.$disconnect();
      }

      await claimSetup(page);
      await page.goto('/setup');
      await settlePage(page);
      await expect(page.getByTestId(route.ready)).toBeVisible();
      await scanAgainstBaseline(page, setupRouteName(route));
    });
  }
});
