import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';
import { LONG_AGO, signUnsubscribeToken, unsubscribePath } from '../helpers/unsubscribe-token';

/**
 * The unsubscribe page and the one-click address (docs/email.md,
 * "Unsubscribe"). A token signed with the test NEXTAUTH_SECRET stands in for
 * the link in an email. The page asks first and changes nothing on load;
 * its button turns the regular member's access reminders off, and without
 * JavaScript it posts to the one-click address with `source=page`, which
 * answers with a short text; both are audited as the link. The Account card shows the switch while the warning emails are on. The one-click
 * POST needs no cookie and no browser. Every test starts and ends with the
 * reminders on and the warning emails off.
 */

const MEMBER_ID = TEST_USERS.REGULAR.id;

async function emailsOff(): Promise<boolean | undefined> {
  const prisma = createE2EPrismaClient();
  try {
    return (await prisma.user.findUnique({ where: { id: MEMBER_ID }, select: { inactivityEmailsOff: true } }))?.inactivityEmailsOff;
  } finally {
    await prisma.$disconnect();
  }
}

/** The `via` of the newest EMAIL_PREFERENCE_CHANGED row for the member: which button turned the emails off. */
async function lastVia(): Promise<unknown> {
  const prisma = createE2EPrismaClient();
  try {
    const row = await prisma.auditLog.findFirst({
      where: { type: 'EMAIL_PREFERENCE_CHANGED', targetUserId: MEMBER_ID },
      orderBy: { createdAt: 'desc' },
      select: { details: true },
    });
    const details = row?.details;
    return details && typeof details === 'object' && !Array.isArray(details) ? details.via : undefined;
  } finally {
    await prisma.$disconnect();
  }
}

async function reset() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.user.update({ where: { id: MEMBER_ID }, data: { inactivityEmailsOff: false } });
    await prisma.auditLog.deleteMany({ where: { type: 'EMAIL_PREFERENCE_CHANGED', targetUserId: MEMBER_ID } });
    await prisma.inactivitySettings.updateMany({ where: { id: 'inactivity' }, data: { warningsEnabled: false } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Turns the warning emails on for the Account card; `reset` turns them off again. */
async function warningsOn() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.inactivitySettings.upsert({
      where: { id: 'inactivity' },
      create: { id: 'inactivity', warningsEnabled: true },
      update: { warningsEnabled: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Email unsubscribe', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(reset);
  test.afterAll(reset);

  test('the page asks first, and its button turns the emails off', async ({ page }) => {
    const response = await page.goto(unsubscribePath(MEMBER_ID));
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');

    await expect(page.getByTestId('unsubscribe-question')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('unsubscribe-form')).not.toContainText('@');
    expect(await emailsOff()).toBe(false);

    // Before React hydrates, a click posts the plain form instead; wait for React on the button
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-testid="unsubscribe-submit"]');
      return button !== null && Object.keys(button).some((key) => key.startsWith('__react'));
    });
    await page.getByTestId('unsubscribe-submit').click();
    await expect(page.getByTestId('unsubscribe-done')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect.poll(emailsOff).toBe(true);
    await expect.poll(lastVia).toBe('link');
  });

  test('the button works without JavaScript', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    try {
      const page = await context.newPage();
      await page.goto(unsubscribePath(MEMBER_ID));
      await page.getByTestId('unsubscribe-submit').click();

      await expect(page.locator('body')).toHaveText(/^Done\. We will not send you these emails\. To turn them on again, sign in to .+ and open Account\.$/, {
        timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
      });
      expect(await emailsOff()).toBe(true);
      // The page's own button, not the mail app's
      await expect.poll(lastVia).toBe('link');
    } finally {
      await context.close();
    }
  });

  test('an old or changed link shows that it no longer works', async ({ page }) => {
    await page.goto(`/email/unsubscribe?token=${signUnsubscribeToken(MEMBER_ID, LONG_AGO)}`);
    await expect(page.getByTestId('unsubscribe-dead-link')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await page.goto(`/email/unsubscribe?token=${signUnsubscribeToken(MEMBER_ID)}x`);
    await expect(page.getByTestId('unsubscribe-dead-link')).toBeVisible();
    await expect(page.getByTestId('unsubscribe-sign-in')).toHaveAttribute('href', '/');
    expect(await emailsOff()).toBe(false);
  });

  test('the one-click POST turns the emails off; a GET only opens the page', async ({ request }) => {
    const token = signUnsubscribeToken(MEMBER_ID);

    const get = await request.get(`/api/email/unsubscribe?token=${token}`, { maxRedirects: 0 });
    expect(get.status()).toBe(303);
    expect(get.headers()['location']).toMatch(new RegExp(`/email/unsubscribe\\?token=${token.replace('.', '\\.')}$`));
    expect(await emailsOff()).toBe(false);

    const bad = await request.post(`/api/email/unsubscribe?token=${token}`, { form: { 'List-Unsubscribe': 'Yes' } });
    expect(bad.status()).toBe(400);
    expect(await emailsOff()).toBe(false);

    const post = await request.post(`/api/email/unsubscribe?token=${token}`, {
      form: { 'List-Unsubscribe': 'One-Click' },
      headers: { 'User-Agent': '' },
    });
    expect(post.status()).toBe(200);
    expect(post.headers()['cache-control']).toBe('no-store');
    expect(await emailsOff()).toBe(true);
    await expect.poll(lastVia).toBe('one_click');
  });

  test('Account shows the Email card only while the warning emails are on', async ({ regularUserPage: page }) => {
    await page.goto('/account');
    await expect(page.getByTestId('account-notifications')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('account-email')).toHaveCount(0);

    await warningsOn();
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.update({ where: { id: MEMBER_ID }, data: { inactivityEmailsOff: true } });
    } finally {
      await prisma.$disconnect();
    }
    await page.reload();
    const toggle = page.getByTestId('account-access-reminders-switch');
    await expect(toggle).toHaveAttribute('aria-checked', 'false', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await expect(async () => {
      if ((await toggle.getAttribute('aria-checked')) === 'false') await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 3000 });
    }).toPass({ timeout: 30_000 });
    await expect.poll(emailsOff).toBe(false);
  });
});
