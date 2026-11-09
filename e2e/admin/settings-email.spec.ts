import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearInbox, readInbox, smtpSinkPort } from '../mocks/smtp-server';

/**
 * Admin > Settings > Email: the web server runs with `SMTP_URL` on the SMTP
 * sink (`e2e/mocks/smtp-server.ts`) and `EMAIL_FROM` set, so the section is
 * set up. It shows the host, the port and the sender, never a login, and
 * "Send a test email" puts one message in the sink for the admin. With Redis
 * the worker sends it, so the spec waits for the sink and for Last test.
 *
 * The button is server-rendered, and a click before React hydrates it does
 * nothing, so the click repeats until the toast shows. afterAll deletes the
 * audit rows the tests wrote.
 */

const SINCE = new Date();

test.describe('Settings, Email', () => {
  test.beforeEach(async () => {
    await clearInbox();
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.auditLog.deleteMany({ where: { type: 'EMAIL_TEST_SENT', createdAt: { gte: SINCE } } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('shows the mail server without a login', async ({ adminPage: page }) => {
    await page.goto('/admin/settings#email');

    await expect(page.getByTestId('settings-email-section')).toBeVisible();
    await expect(page.getByTestId('settings-email-summary-status')).toContainText('Set up');
    await expect(page.getByTestId('settings-email-summary-server')).toContainText(`127.0.0.1:${smtpSinkPort()}`);
    await expect(page.getByTestId('settings-email-summary-from')).toContainText('noreply@example.test');
    await expect(page.getByTestId('settings-email-summary-login')).toContainText('None');
  });

  test('sends a test email to the admin', async ({ adminPage: page }) => {
    await page.goto('/admin/settings#email');
    const send = page.getByTestId('settings-email-send-test');
    await expect(send).toBeVisible();

    await expect(async () => {
      if ((await readInbox()).length === 0) await send.click();
      await expect(page.getByText(/^Test email (sent|queued)/)).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 30_000 });

    await expect.poll(async () => (await readInbox()).length, { timeout: 30_000 }).toBeGreaterThan(0);
    const [message] = await readInbox();
    expect(message.from).toBe('noreply@example.test');
    expect(message.to).toEqual([TEST_USERS.ADMIN.email]);
    expect(message.raw).toMatch(/^Subject: \[Test\] Email from /m);
    expect(message.raw).toMatch(/^From: .*<noreply@example\.test>/m);
    expect(message.raw).toMatch(/^To: admin@example\.com/m);
    expect(message.raw).toMatch(/^Auto-Submitted: auto-generated/m);
    expect(message.raw).toMatch(/^Content-Type: multipart\/alternative/m);
    expect(message.raw).not.toMatch(/Wrapped/);

    // The worker writes the audit row after the sink answers
    await expect(async () => {
      await page.reload();
      await expect(page.getByTestId('settings-email-last-test')).toContainText('Sent', { timeout: 2000 });
    }).toPass({ timeout: 30_000 });
  });
});
