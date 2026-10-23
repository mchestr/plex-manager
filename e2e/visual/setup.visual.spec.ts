import globalSetup from '../global-setup';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearVisualFixtures, seedVisualFixtures } from '../helpers/seed-fixtures';
import { claimSetup } from '../helpers/setup-claim';
import { capture, skipUnlessProductionBuild, test } from './visual-test';

/**
 * The setup wizard against `setup.html` (P1.6, P10.25): the claim, the Plex
 * step and step 3 (Overseerr). Reopening setup sends every other page to
 * /setup, so its projects depend on `setup-wizard` and the seed is restored
 * afterwards the way setup-wizard.spec.ts does it.
 */

skipUnlessProductionBuild();

async function reopenAt(currentStepId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.setup.deleteMany();
    await prisma.setup.create({ data: { isComplete: false, currentStepId } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Setup wizard', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedVisualFixtures();
  });

  test.afterAll(async () => {
    await clearVisualFixtures();
    await globalSetup();
  });

  test('claim', async ({ page }) => {
    await reopenAt('plex');
    await capture(page, '/setup', 'setup-claim');
  });

  test('step 1, Plex', async ({ page }) => {
    await reopenAt('plex');
    await claimSetup(page);
    await capture(page, '/setup', 'setup-step-1');
  });

  test('step 3', async ({ page }) => {
    await reopenAt('overseerr');
    await claimSetup(page);
    await capture(page, '/setup', 'setup-step-3');
  });
});
