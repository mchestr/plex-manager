import { expect, test } from '../fixtures/auth';

/**
 * P7.11: `/admin/rewind/gallery` runs the heavy fixture's dry run (P7.10) and
 * shows it through the real routes: the cover frame holds the story stage,
 * and the centrefold card comes from the preview card route.
 */

/** A dry run can take 90 s on a shared runner. */
const RUN_TIMEOUT_MS = 240_000;

test('the heavy tab frames the story and loads its centrefold card', async ({ adminPage }) => {
  test.setTimeout(RUN_TIMEOUT_MS + 60_000);
  await adminPage.goto('/admin/rewind/gallery?fixture=heavy&copy=templates');
  await expect(adminPage.getByTestId('rewind-gallery-ready')).toBeVisible({ timeout: RUN_TIMEOUT_MS });

  const cover = adminPage.getByTestId('rewind-gallery-frame-cover');
  await cover.scrollIntoViewIfNeeded();
  await expect(cover.contentFrame().getByTestId('rewind-stage')).toBeVisible();

  const card = adminPage.getByTestId('rewind-gallery-card-image-centrefold');
  const src = await card.getAttribute('src');
  expect(src).toBeTruthy();
  const response = await adminPage.request.get(src!);
  expect(response.status()).toBe(200);
});
