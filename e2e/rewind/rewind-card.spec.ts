import { expect, test } from '../fixtures/session';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearRewindSeed, REWIND_MEMBERS, REWIND_YEAR, seedRewind } from '../helpers/seed-rewind';

/**
 * P6.9: the home RewindCard, in `rewind-e2e-chromium` and `rewind-e2e-webkit`.
 *
 * The card resolves on the server, so `page.clock` cannot move it: each test
 * sets the season window around the server's real date instead (the Jest
 * resolver tests pin the 20 November teaser and the other dates). Both need
 * the server's year to be the seeded {@link REWIND_YEAR}.
 */

const CONFIG_SELECT = { rewindSeasonOpens: true, rewindSeasonCloses: true, rewindEnabled: true, rewindAudience: true } as const;
type SeasonConfig = { rewindSeasonOpens: string; rewindSeasonCloses: string; rewindEnabled: boolean; rewindAudience: string };

const monthDay = (date: Date) => `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

async function setSeason(data: Partial<SeasonConfig>): Promise<void> {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.config.update({ where: { id: 'config' }, data });
  } finally {
    await prisma.$disconnect();
  }
}

/** Records every view-transition name on the page as each transition starts. */
async function recordViewTransitions(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const names: string[] = [];
    // A browser without the API (this WebKit build) navigates with no transition: `null`.
    const supported = 'startViewTransition' in Document.prototype;
    (window as unknown as { __vtNames: string[] | null }).__vtNames = supported ? names : null;
    if (!supported) return;
    const start = Document.prototype.startViewTransition;
    Document.prototype.startViewTransition = function (this: Document, ...args: Parameters<typeof start>) {
      for (const el of document.querySelectorAll('*')) {
        const name = getComputedStyle(el).viewTransitionName;
        if (name && name !== 'none') names.push(name);
      }
      return start.apply(this, args);
    } as typeof start;
  });
}

test.describe('Home RewindCard', () => {
  let previous: SeasonConfig | null = null;

  test.beforeAll(async () => {
    test.skip(new Date().getFullYear() !== REWIND_YEAR, `the seeded issues are for ${REWIND_YEAR}`);
    await seedRewind();
    const prisma = createE2EPrismaClient();
    try {
      previous = await prisma.config.findUnique({ where: { id: 'config' }, select: CONFIG_SELECT });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    if (previous) await setSeason(previous);
    await clearRewindSeed();
  });

  test.beforeEach(async ({ signIn }) => {
    await signIn(REWIND_MEMBERS.median.id);
  });

  test('a seeded issue shows the ready state with the pip, and Open morphs the strip into the cover', async ({ page }) => {
    await setSeason({ rewindSeasonOpens: '01-01', rewindSeasonCloses: '12-31', rewindEnabled: true, rewindAudience: 'all' });
    await recordViewTransitions(page);
    await page.goto('/');

    const card = page.getByTestId('rewind-card');
    await expect(card).toHaveAttribute('data-state', 'ready');
    await expect(card.getByTestId('rewind-card-unread')).toBeVisible();
    await expect(card.getByTestId('rewind-card-strip')).toHaveAttribute('data-theme', 'rewind');
    await expect(card.getByTestId('rewind-card-share')).toHaveAttribute('href', `/rewind/${REWIND_YEAR}?sheet=share&from=/`);
    await expect(page.getByRole('button', { name: /generate/i })).toHaveCount(0);

    await card.getByTestId('rewind-card-open').click();
    await expect(page).toHaveURL(new RegExp(`/rewind/${REWIND_YEAR}\\?from=/$`));
    await expect(page.getByTestId('rewind-page-cover')).toBeVisible();
    const names = await page.evaluate(() => (window as unknown as { __vtNames: string[] | null }).__vtNames);
    // Where the browser has view transitions, the strip morphs into the cover's field
    if (names !== null) expect(names).toContain('rewind-field');
  });

  test('before the season, with the flags off, the card says when Rewind arrives on paper', async ({ page }) => {
    const opens = new Date(Date.now() + 5 * 86_400_000);
    test.skip(opens.getFullYear() !== REWIND_YEAR, 'the season must open in the same year');
    await setSeason({ rewindSeasonOpens: monthDay(opens), rewindSeasonCloses: '12-31', rewindEnabled: false, rewindAudience: 'admins' });
    await page.goto('/');

    const card = page.getByTestId('rewind-card');
    await expect(card).toHaveAttribute('data-state', 'before-season');
    const day = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric' }).format(opens);
    await expect(card.getByTestId('rewind-card-title')).toHaveText(`Your Rewind arrives on ${day}`);
    await expect(card.getByTestId('rewind-card-strip')).toHaveAttribute('data-field', 'paper');
    await expect(card.getByTestId('rewind-card-open')).toHaveCount(0);
  });
});
