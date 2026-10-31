import { expect, test } from '../fixtures/auth';

/**
 * P8.8: `/admin/playground` lands on `/admin/rewind/playground`, and a heavy
 * fixture dry run (P7.10) in "Templates only" shows every pane and a story
 * preview whose iframe holds the stage.
 */

/** A dry run can take a few minutes on a shared runner. */
const RUN_TIMEOUT_MS = 240_000;

test('the old playground address redirects', async ({ adminPage }) => {
  await adminPage.goto('/admin/playground');
  await expect(adminPage).toHaveURL(/\/admin\/rewind\/playground$/);
  await expect(adminPage.getByTestId('admin-rewind-playground-header')).toBeVisible();
});

test('a heavy fixture run in Templates only shows every pane and the story preview', async ({ adminPage }) => {
  test.setTimeout(RUN_TIMEOUT_MS + 60_000);
  await adminPage.goto('/admin/rewind/playground?fixture=heavy');
  await expect(adminPage.getByTestId('playground-form')).toBeVisible();

  await adminPage.getByTestId('playground-copy-policy-trigger').click();
  await adminPage.getByTestId('playground-copy-policy-option-no-llm').click();
  await adminPage.getByTestId('playground-run').click();

  await expect(adminPage.getByTestId('playground-result')).toBeVisible({ timeout: RUN_TIMEOUT_MS });
  for (const pane of ['playground-facts', 'playground-selection', 'playground-copy', 'playground-cost', 'playground-preview']) {
    await expect(adminPage.getByTestId(pane)).toBeVisible();
  }
  await expect(adminPage.getByTestId('playground-cost-path')).toContainText('Templates only');

  await adminPage.getByTestId('playground-preview-open').click();
  const frame = adminPage.getByTestId('playground-preview-frame');
  await expect(frame).toBeVisible();
  await expect(frame.contentFrame().getByTestId('rewind-stage')).toBeVisible({ timeout: 60_000 });
});
