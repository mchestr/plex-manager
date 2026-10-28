import { Queue } from 'bullmq';

import { expect, test } from '../fixtures/auth';

/**
 * The job queues page (P10.3): pause through the confirm and read "Queue
 * paused", then resume; retry a seeded failed job from its row menu; and no
 * sideways scroll at 390px, before hydration as well as after it.
 *
 * The failed job is an unknown job type, which the in-process worker fails
 * on its one attempt. Without a worker it never fails, and that test skips.
 */
const QUEUE_NAME = 'plex-wrapped';
const SEEDED_TYPE = 'e2e:unknown';

test.describe('Job queues', () => {
  test.describe.configure({ mode: 'serial' });

  test('pauses through the confirm, then resumes', async ({ adminPage }) => {
    await adminPage.goto('/admin/queues');
    await expect(adminPage.getByTestId('admin-queues-header')).toBeVisible();
    await expect(adminPage.getByTestId('queue-live-updated')).toContainText(/Updated \d+s ago/);

    const toggle = adminPage.getByTestId('queue-pause-resume-btn');
    await expect(toggle).toHaveText('Pause queue');
    await toggle.click();
    await expect(adminPage.getByTestId('queue-pause-dialog')).toContainText("won't run until you resume");
    await adminPage.getByTestId('queue-pause-confirm').click();
    await expect(adminPage.getByTestId('queue-status-queue')).toHaveText('Queue paused');
    await expect(toggle).toHaveText('Resume queue');

    await toggle.click();
    await adminPage.getByTestId('queue-pause-confirm').click();
    await expect(adminPage.getByTestId('queue-status-queue')).toHaveText('Queue running');
    await expect(toggle).toHaveText('Pause queue');
  });

  test('retries a failed job from its row menu', async ({ adminPage }) => {
    const queue = new Queue(QUEUE_NAME, { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } });
    try {
      const job = await queue.add(SEEDED_TYPE, {}, { jobId: `e2e-fail-${Date.now()}`, attempts: 1 });
      let state = await job.getState();
      for (let i = 0; i < 30 && state !== 'failed'; i++) {
        await adminPage.waitForTimeout(500);
        state = await job.getState();
      }
      test.skip(state !== 'failed', 'No worker took the seeded job');

      // A retried job runs again, so it gets a new start time.
      const firstRun = (await queue.getJob(job.id!))?.processedOn;
      await adminPage.goto('/admin/queues?status=failed');
      const actions = adminPage.getByTestId(`queue-jobs-actions-${job.id}`);
      await expect(actions).toBeVisible();
      await actions.click();
      await adminPage.getByTestId(`queue-jobs-actions-${job.id}-retry`).click();
      await expect
        .poll(async () => (await queue.getJob(job.id!))?.processedOn, { timeout: 15_000 })
        .not.toBe(firstRun);
      await queue.remove(job.id!);
    } finally {
      await queue.close();
    }
  });

  test('fits a phone', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 });
    await adminPage.goto('/admin/queues');
    await expect(adminPage.getByTestId('queue-status')).toBeVisible();
    const width = await adminPage.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBe(390);
  });

  // The cards come from container queries, so the server HTML already fits a
  // phone. Blocking the app's script chunks holds the page before hydration:
  // Next's inline scripts still reveal the streamed HTML, but React never hydrates.
  test('fits a phone before hydration, with a job in the table', async ({ adminPage, browser }) => {
    const queue = new Queue(QUEUE_NAME, { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } });
    const job = await queue.add(SEEDED_TYPE, {}, { jobId: `e2e-delayed-${Date.now()}`, delay: 60 * 60 * 1000 });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: await adminPage.context().storageState(),
    });
    try {
      const page = await context.newPage();
      await page.route('**/_next/static/chunks/**/*.js', (route) => route.abort());
      await page.goto(new URL('/admin/queues?status=delayed', test.info().project.use.baseURL).toString());
      await expect(page.getByTestId(`queue-jobs-row-${job.id}`)).toBeVisible();
      const width = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBe(390);
    } finally {
      await context.close();
      await job.remove();
      await queue.close();
    }
  });
});
