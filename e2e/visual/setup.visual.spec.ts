import globalSetup from '../global-setup';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearVisualFixtures, seedVisualFixtures } from '../helpers/seed-fixtures';
import { claimSetup } from '../helpers/setup-claim';
import { capture, skipUnlessProductionBuild, test } from './visual-test';

/**
 * Setup wizard step 3 (P1.6). Reopens setup at step 3, which sends every
 * other page to /setup, so its projects depend on `setup-wizard` and the
 * seed is restored afterwards the way setup-wizard.spec.ts does it.
 */

skipUnlessProductionBuild();

test.describe('Setup wizard', () => {
  test.beforeAll(async () => {
    await seedVisualFixtures();
    const prisma = createE2EPrismaClient();
    try {
      await prisma.setup.deleteMany();
      await prisma.setup.create({ data: { isComplete: false, currentStep: 3 } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    await clearVisualFixtures();
    await globalSetup();
  });

  test('step 3', async ({ page }) => {
    await claimSetup(page);
    await capture(page, '/setup', 'setup-step-3');
  });
});
