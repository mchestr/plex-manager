import { randomBytes } from 'node:crypto';

import type { Page } from '@playwright/test';
import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { navigateAndVerify, waitForLoadingGone, WAIT_TIMEOUTS } from './helpers/test-utils';

test.describe('Public Flows', () => {
  // P10.27 (UI-35): one click on Continue with Plex reaches plex.tv, with no forced wait
  test('one click on the member pass reaches plex.tv within a second', async ({ page }) => {
    await page.route('https://app.plex.tv/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Plex</title>' })
    );
    await navigateAndVerify(page, '/');

    const signInButton = page.getByTestId('sign-in-button');
    await expect(signInButton).toBeEnabled({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('member-pass-token-copy')).toContainText('keeps your Plex sign-in token');

    const clickedAt = Date.now();
    await signInButton.click();
    await page.waitForURL(/app\.plex\.tv/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    expect(Date.now() - clickedAt).toBeLessThan(1000);
  });

  // P4.8 (SEC-11). The E2E server skips plex.tv, so the PIN is made up and
  // never becomes ready; app.plex.tv itself is never opened.
  test('Plex sign-in binds the PIN to this browser and never hands the page a token', async ({ page, context }) => {
    await page.route('https://app.plex.tv/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Plex</title>' })
    );
    // Every Server Action response the page receives, read in full on the way through
    const actionBodies: string[] = [];
    await page.route('**/*', async (route) => {
      const request = route.request();
      if (request.method() !== 'POST' || !request.headers()['next-action']) {
        return route.fallback();
      }
      const response = await route.fetch();
      const body = await response.text();
      actionBodies.push(body);
      return route.fulfill({ response, body });
    });

    await navigateAndVerify(page, '/');
    await page.getByTestId('sign-in-button').click();
    await page.waitForURL(/app\.plex\.tv/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    const cookies = await context.cookies();
    const pinCookie = cookies.find((cookie) => cookie.name === 'pm-plex-pin');
    expect(pinCookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    expect(cookies.find((cookie) => cookie.name === 'pm-plex-client')).toMatchObject({ httpOnly: true });
    // plex.tv sends the browser back with nothing in the URL
    const forwardUrl = new URLSearchParams(new URL(page.url()).hash.replace(/^#\?/, '')).get('forwardUrl');
    expect(forwardUrl && new URL(forwardUrl).pathname).toBe('/auth/callback/plex');
    expect(forwardUrl && new URL(forwardUrl).search).toBe('');

    await page.goto('/auth/callback/plex');
    await expect(page.getByTestId('plex-callback-waiting')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    // Wait for at least one status poll after the sign-in start
    await expect.poll(() => actionBodies.length, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT }).toBeGreaterThan(1);

    const bodies = [...actionBodies];
    expect(bodies.some((body) => body.includes('"waiting"'))).toBe(true);
    for (const body of bodies) {
      expect(body).not.toContain('authToken');
      expect(body).not.toContain(pinCookie?.value ?? 'pm-plex-pin');
    }
  });

  test('a callback opened in a browser that did not start the sign-in does not finish', async ({ page }) => {
    await page.goto('/auth/callback/plex');

    await expect(page.getByTestId('plex-callback-error-heading')).toHaveText("Sign-in didn't finish", {
      timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
    });
  });

  test('invite page shows invalid state for unknown code', async ({ page }) => {
    const inviteCode = 'test-invite-code';
    await navigateAndVerify(page, `/invite/${inviteCode}`, {
      waitForSelector: 'h1, h2, [role="heading"]'
    });

    await expect(page.getByTestId('invalid-invite-heading')).toHaveText("We couldn't find that invite", {
      timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
    });
  });

  // P10.26 (UI-36): the invite page is server-rendered, so its state and unfurl need no JavaScript
  test.describe('invite pass', () => {
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    const codes = { valid: `PASSOK${suffix}`, expired: `PASSEXP${suffix}` };

    test.beforeAll(async () => {
      const prisma = createE2EPrismaClient();
      try {
        await prisma.invite.createMany({
          data: [
            { code: codes.valid, maxUses: 5, useCount: 1, expiresAt: new Date('2099-01-01T00:00:00Z'), createdBy: TEST_USERS.ADMIN.id },
            { code: codes.expired, maxUses: 1, expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), createdBy: TEST_USERS.ADMIN.id },
          ],
        });
      } finally {
        await prisma.$disconnect();
      }
    });

    test.afterAll(async () => {
      const prisma = createE2EPrismaClient();
      try {
        await prisma.invite.deleteMany({ where: { code: { in: [codes.valid, codes.expired] } } });
      } finally {
        await prisma.$disconnect();
      }
    });

    test('a valid invite shows the pass with Accept with Plex', async ({ page }) => {
      await page.goto(`/invite/${codes.valid}`);

      await expect(page.getByTestId('valid-invite-heading')).toContainText("You're invited to", { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(page.getByTestId('invite-pass')).toHaveAttribute('data-state', 'valid');
      await expect(page.getByTestId('plex-invite-sign-in')).toBeVisible();
      await expect(page.getByTestId('invite-pass-uses')).toHaveText('4 of 5');
    });

    test('an expired invite shows the voided pass', async ({ page }) => {
      await page.goto(`/invite/${codes.expired}`);

      await expect(page.getByTestId('invalid-invite-heading')).toHaveText('This invite has expired', {
        timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
      });
      await expect(page.getByTestId('invite-pass')).toHaveAttribute('data-state', 'expired');
    });

    test('the invite unfurls without JavaScript', async ({ request }) => {
      const response = await request.get(`/invite/${codes.valid}`);
      expect(response.ok()).toBe(true);

      const html = await response.text();
      expect(html).toMatch(/<meta property="og:title" content="You(?:'|&#x27;|&#39;)re invited to [^"]+"/);
      expect(html).toContain('name="robots" content="noindex, nofollow"');
      expect(html).not.toMatch(new RegExp(`<meta[^>]+content="[^"]*${codes.valid}`));
    });
  });

  test('setup page redirects if already set up', async ({ page }) => {
    await page.goto('/setup');

    // Wait for any client-side redirects or hydration to finish
    await page.waitForLoadState('networkidle');

    // Wait for loading screen to disappear
    await waitForLoadingGone(page);

    // Verify we're redirected to home page with sign-in button
    await expect(page.getByTestId('sign-in-button')).toBeVisible();
  });

  test('denied page is accessible', async ({ page }) => {
    await page.goto('/auth/denied');

    await expect(page.getByTestId('access-denied-heading')).toBeVisible();
    await expect(page.getByTestId('denied-sign-out')).toBeVisible();
  });

  test('a NextAuth error lands on the branded error page', async ({ page }) => {
    await page.goto('/api/auth/error?error=AccessDenied');

    await expect(page).toHaveURL(/\/auth\/error\?error=AccessDenied/);
    await expect(page.getByTestId('auth-error-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('status-screen-code')).toHaveText('AccessDenied');
  });

  test('the branded error page never shows the query text', async ({ page }) => {
    await page.goto('/auth/error?error=Your%20account%20is%20locked');

    await expect(page.getByTestId('status-screen-code')).toHaveText('Default', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByText('Your account is locked')).toHaveCount(0);
  });

  test('onboarding page accessibility check', async ({ page }) => {
    await page.goto('/onboarding');

    // Unauthenticated users should be redirected to home
    // Wait for either the sign-in button (home page) or the onboarding wizard
    // Using waitForSelector with a race condition to handle either outcome
    const signInButton = page.getByTestId('sign-in-button');
    const onboardingHeading = page.getByTestId('onboarding-wizard-heading');

    // Wait for either element to appear (whichever comes first)
    await Promise.race([
      signInButton.waitFor({ state: 'visible', timeout: WAIT_TIMEOUTS.PAGE_CONTENT }),
      onboardingHeading.waitFor({ state: 'visible', timeout: WAIT_TIMEOUTS.PAGE_CONTENT }),
    ]);

    // After one element is visible, check which state we're in
    const isOnHome = await signInButton.isVisible();
    const isOnOnboarding = await onboardingHeading.isVisible();

    // For unauthenticated users (the default in this test), we expect redirect to home
    // For authenticated users with incomplete onboarding, we'd see the wizard
    expect(isOnHome || isOnOnboarding).toBeTruthy();

    if (isOnOnboarding) {
      // Verify the subheading as well
      await expect(page.getByTestId('onboarding-wizard-subheading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    }
  });
});

/**
 * P0.11 (RWP-09, SEC-26, RWV-05, BP-23): the share page reads the database
 * directly and sits outside the (app) guards.
 */
test.describe('Shared Rewind page', () => {
  // Each test that views a share gets its own row, so a late visit write
  // from one test never lands in another's count.
  const SHARE_YEARS = [2021, 2022, 2023, 2024];
  const newToken = () => randomBytes(32).toString('base64url');

  /** A completed Rewind of the regular user, shared with `token`. */
  async function seedShare(year: number, token: string) {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.REGULAR.id, year } });
      await prisma.plexWrapped.create({
        data: {
          userId: TEST_USERS.REGULAR.id,
          year,
          status: 'completed',
          shareToken: token,
          data: JSON.stringify({
            year,
            statistics: {
              totalWatchTime: { total: 1000, movies: 600, shows: 400 },
              moviesWatched: 10,
              showsWatched: 5,
              episodesWatched: 20,
              topMovies: [{ title: 'Test Movie', watchTime: 120, playCount: 1 }],
              topShows: [{ title: 'Test Show', watchTime: 200, playCount: 2, episodesWatched: 4 }],
            },
          }),
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  }

  /**
   * Opens a share link and waits for the streamed page to settle: the root
   * loading screen streams first, and next dev may still be compiling.
   */
  async function openShare(page: Page, token: string) {
    const response = await page.goto(`/rewind/s/${token}`);
    await page.waitForLoadState('networkidle');
    await waitForLoadingGone(page);
    return response;
  }

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.REGULAR.id, year: { in: SHARE_YEARS } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('renders for a logged-out visitor', async ({ page }) => {
    const shareToken = newToken();
    await seedShare(SHARE_YEARS[0], shareToken);

    const response = await openShare(page, shareToken);

    expect(response?.status()).toBe(200);
    await expect(page.getByTestId('rewind-share-v2')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('rewind-share-v2-totals')).toBeVisible();
  });

  test('renders for a signed-in member who has not finished onboarding', async ({ regularUserPage }) => {
    const shareToken = newToken();
    await seedShare(SHARE_YEARS[1], shareToken);
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.update({
        where: { id: TEST_USERS.REGULAR.id },
        data: { onboardingStatus: { plex: false, jellyfin: false } },
      });

      // The (app) guards now send this member to onboarding...
      await regularUserPage.goto('/');
      await expect(regularUserPage).toHaveURL(/\/onboarding$/);

      // ...but the share page is outside them.
      await openShare(regularUserPage, shareToken);
      await expect(regularUserPage.getByTestId('rewind-share-v2')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(regularUserPage).toHaveURL(new RegExp(`/rewind/s/${shareToken}$`));
    } finally {
      await prisma.user.update({
        where: { id: TEST_USERS.REGULAR.id },
        data: { onboardingStatus: TEST_USERS.REGULAR.onboardingStatus },
      });
      await prisma.$disconnect();
    }
  });

  test('records one visit per view', async ({ page }) => {
    const shareToken = newToken();
    await seedShare(SHARE_YEARS[2], shareToken);
    const prisma = createE2EPrismaClient();
    try {
      const where = { wrapped: { shareToken } };

      for (let view = 0; view < 3; view++) {
        await openShare(page, shareToken);
        await expect(page.getByTestId('rewind-share-v2')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      }

      // after() writes the row once the response is done.
      await expect.poll(() => prisma.wrappedShareVisit.count({ where })).toBe(3);
      const visits = await prisma.wrappedShareVisit.findMany({ where, select: { ipAddress: true, userAgent: true, referer: true } });
      expect(visits.every((visit) => !visit.ipAddress && !visit.userAgent && !visit.referer)).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('a bad token is a 404', async ({ page }) => {
    const response = await openShare(page, 'bad-token');

    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('rewind-share-not-found')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });

  // The page's notFound() streams after app/loading.tsx with status 200, so
  // proxy.ts looks the token up and sets the 404 itself.
  test('an unknown or revoked token is a 404', async ({ page }) => {
    const revokedToken = newToken();
    await seedShare(SHARE_YEARS[3], revokedToken);
    const prisma = createE2EPrismaClient();
    try {
      const unknown = await openShare(page, newToken());
      expect(unknown?.status()).toBe(404);
      await expect(page.getByTestId('rewind-share-not-found')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      const shared = await openShare(page, revokedToken);
      expect(shared?.status()).toBe(200);
      await expect(page.getByTestId('rewind-share-v2')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      await prisma.plexWrapped.update({ where: { shareToken: revokedToken }, data: { shareToken: null } });
      // A fresh visit, not a reload of the page on screen.
      await page.goto('about:blank');
      const revoked = await openShare(page, revokedToken);
      expect(revoked?.status()).toBe(404);
      await expect(page.getByTestId('rewind-share-not-found')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(page.getByTestId('rewind-share-v2')).toHaveCount(0);
    } finally {
      await prisma.$disconnect();
    }
  });
});
