import { expect, test } from '../fixtures/session';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearRewindSeed, REWIND_MEMBERS, REWIND_YEAR, seedRewind, seedRewindIssue } from '../helpers/seed-rewind';

/**
 * P7.14: "Notify me" on a generating Rewind, and the ready notice that the
 * first view clears. Runs in `rewind-e2e-chromium` and `rewind-e2e-webkit`;
 * the notice reads the season year from the server's real date, so the
 * season window is opened around it for the run.
 */

const CONFIG_SELECT = { rewindSeasonOpens: true, rewindSeasonCloses: true, rewindNotifyChannels: true } as const;

type SavedConfig = { rewindSeasonOpens: string; rewindSeasonCloses: string; rewindNotifyChannels: unknown };

async function withPrisma<T>(fn: (prisma: ReturnType<typeof createE2EPrismaClient>) => Promise<T>): Promise<T> {
  const prisma = createE2EPrismaClient();
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Rewind ready notifications', () => {
  let previous: SavedConfig | null = null;

  test.beforeAll(async () => {
    test.skip(new Date().getFullYear() !== REWIND_YEAR, `the seeded issues are for ${REWIND_YEAR}`);
    await seedRewind();
    previous = await withPrisma((prisma) => prisma.config.findUnique({ where: { id: 'config' }, select: CONFIG_SELECT }));
    await withPrisma((prisma) =>
      prisma.config.update({
        where: { id: 'config' },
        data: { rewindSeasonOpens: '01-01', rewindSeasonCloses: '12-31', rewindNotifyChannels: ['discord', 'banner'] },
      })
    );
  });

  test.afterAll(async () => {
    if (previous) {
      const { rewindSeasonOpens, rewindSeasonCloses, rewindNotifyChannels } = previous;
      await withPrisma((prisma) =>
        prisma.config.update({ where: { id: 'config' }, data: { rewindSeasonOpens, rewindSeasonCloses, rewindNotifyChannels: rewindNotifyChannels ?? [] } })
      );
    }
    await clearRewindSeed();
  });

  test('"Notify me" on a generating Rewind shows the toast and turns notifications on', async ({ page, signIn }) => {
    const member = REWIND_MEMBERS.light;
    await withPrisma(async (prisma) => {
      await prisma.plexWrapped.deleteMany({ where: { userId: member.id, year: REWIND_YEAR } });
      const wrapped = await prisma.plexWrapped.create({ data: { userId: member.id, year: REWIND_YEAR, status: 'generating', data: '{}' } });
      await prisma.rewindGeneration.create({
        data: { wrappedId: wrapped.id, userId: member.id, year: REWIND_YEAR, kind: 'member', status: 'running', startedAt: new Date() },
      });
      await prisma.rewindPrefs.upsert({
        where: { userId_year: { userId: member.id, year: REWIND_YEAR } },
        create: { userId: member.id, year: REWIND_YEAR, notify: false },
        update: { notify: false },
      });
    });
    await signIn(member.id);

    await page.goto(`/rewind/${REWIND_YEAR}`);
    await expect(page.getByTestId('rewind-status-panel')).toHaveAttribute('data-kind', 'generating');
    await page.getByTestId('rewind-notify-me').click();

    await expect(page.getByText("We'll let you know")).toBeVisible();
    await expect
      .poll(() =>
        withPrisma((prisma) => prisma.rewindPrefs.findUnique({ where: { userId_year: { userId: member.id, year: REWIND_YEAR } }, select: { notify: true } }))
      )
      .toEqual({ notify: true });

    await seedRewindIssue(member.id, 'light');
  });

  test('a completed Rewind shows the notice on /account until it is opened', async ({ page, signIn }) => {
    const member = REWIND_MEMBERS.median;
    // A fresh row has no views. The fixture's generatedAt is in December, and
    // only a view from on or after it clears the notice, so date it an hour ago.
    await seedRewindIssue(member.id, 'median');
    await withPrisma(async (prisma) => {
      await prisma.rewindPrefs.deleteMany({ where: { userId: member.id, year: REWIND_YEAR } });
      await prisma.plexWrapped.update({
        where: { userId_year: { userId: member.id, year: REWIND_YEAR } },
        data: { generatedAt: new Date(Date.now() - 60 * 60 * 1000) },
      });
    });
    await signIn(member.id);

    await page.goto('/account');
    const notice = page.getByTestId('rewind-ready-notice');
    await expect(notice).toBeVisible();
    await expect(notice.getByTestId('rewind-ready-open')).toHaveAttribute('href', `/rewind/${REWIND_YEAR}`);

    await page.goto(`/rewind/${REWIND_YEAR}`);
    await expect(page.getByTestId('rewind-stage')).toBeVisible();
    await expect
      .poll(() => withPrisma((prisma) => prisma.rewindView.count({ where: { wrapped: { userId: member.id, year: REWIND_YEAR } } })))
      .toBe(1);

    await page.goto('/account');
    await expect(page.getByTestId('account-notify-switch')).toBeVisible();
    await expect(page.getByTestId('rewind-ready-notice')).toHaveCount(0);
  });
});
