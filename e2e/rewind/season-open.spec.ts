import { expect, test } from '../fixtures/session';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearRewindSeed, REWIND_MEMBERS, REWIND_YEAR, seedRewind } from '../helpers/seed-rewind';

/**
 * P8.2: the season open's audience switch, in `rewind-e2e-chromium` and
 * `rewind-e2e-webkit`. Under "Admins only" a member sees the before-season
 * card while an admin already sees the ready card; once the audience is
 * everyone (what the 08:00 job and the settings save both write), the member
 * sees the ready card with its unread pip.
 *
 * The card resolves on the server from its real date, so the season is set to
 * open in five days (inside the teaser window) around it.
 */

const CONFIG_SELECT = { rewindSeasonOpens: true, rewindSeasonCloses: true, rewindEnabled: true, rewindAudience: true } as const;
type SeasonConfig = { rewindSeasonOpens: string; rewindSeasonCloses: string; rewindEnabled: boolean; rewindAudience: string };

const ADMIN = REWIND_MEMBERS.heavy;
const MEMBER = REWIND_MEMBERS.median;

const monthDay = (date: Date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

async function withPrisma<T>(fn: (prisma: ReturnType<typeof createE2EPrismaClient>) => Promise<T>): Promise<T> {
  const prisma = createE2EPrismaClient();
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const setConfig = (data: Partial<SeasonConfig>) => withPrisma((prisma) => prisma.config.update({ where: { id: 'config' }, data }));

test.describe('Season open', () => {
  let previous: SeasonConfig | null = null;
  const opens = new Date(Date.now() + 5 * 86_400_000);

  test.beforeAll(async () => {
    test.skip(new Date().getFullYear() !== REWIND_YEAR || opens.getFullYear() !== REWIND_YEAR, `the seeded issues and the season are for ${REWIND_YEAR}`);
    await seedRewind();
    await withPrisma((prisma) => prisma.user.update({ where: { id: ADMIN.id }, data: { isAdmin: true } }));
    previous = await withPrisma((prisma) => prisma.config.findUnique({ where: { id: 'config' }, select: CONFIG_SELECT }));
  });

  test.afterAll(async () => {
    if (previous) await setConfig(previous);
    await clearRewindSeed();
  });

  test.beforeEach(async () => {
    await setConfig({ rewindSeasonOpens: monthDay(opens), rewindSeasonCloses: '12-31', rewindEnabled: true, rewindAudience: 'admins' });
  });

  test('under Admins only, a member sees the before-season card and an admin the ready card', async ({ page, signIn }) => {
    await signIn(MEMBER.id);
    await page.goto('/');
    await expect(page.getByTestId('rewind-card')).toHaveAttribute('data-state', 'before-season');
    await expect(page.getByTestId('rewind-card-open')).toHaveCount(0);

    await signIn(ADMIN.id);
    await page.goto('/');
    await expect(page.getByTestId('rewind-card')).toHaveAttribute('data-state', 'ready');
  });

  test('after the switch to everyone, the member sees the ready card with its pip', async ({ page, signIn }) => {
    await setConfig({ rewindAudience: 'all' });
    await signIn(MEMBER.id);
    await page.goto('/');

    const card = page.getByTestId('rewind-card');
    await expect(card).toHaveAttribute('data-state', 'ready');
    await expect(card.getByTestId('rewind-card-unread')).toBeVisible();
    await expect(card.getByTestId('rewind-card-open')).toBeVisible();
  });
});
