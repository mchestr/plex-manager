import { expect, test } from '@playwright/test';

// Overlay and feedback primitives in the browser (plan step P3.6,
// ui-design-system 5.4): toasts sit above dialogs, errors persist, and the
// keyboard reaches them.

test.describe('overlays on /dev/ui', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/ui');
    // Until React swaps in the streamed page, a hidden copy shares its test id.
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('dev-ui')).toHaveCount(1);
    await expect(page.getByTestId('dev-ui')).toBeVisible();
  });

  test('a toast fired from a dialog renders above it', async ({ page }) => {
    await page.getByTestId('dev-ui-dialog-open').click();
    const dialog = page.getByTestId('dev-ui-dialog-content');
    await expect(dialog).toBeVisible();

    await page.getByTestId('dev-ui-dialog-toast').click();
    const toast = page.getByTestId('toast').filter({ hasText: 'Invite link copied' });
    await expect(toast).toBeVisible();

    const box = await toast.boundingBox();
    if (!box) throw new Error('The toast has no box');
    const onTop = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="toast"]') !== null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    );
    expect(onTop).toBe(true);
    // Dismissing the toast leaves the dialog open.
    await toast.getByTestId('toast-dismiss').click();
    await expect(toast).toHaveCount(0);
    await expect(dialog).toBeVisible();
  });

  test('the dialog closes on Escape and returns focus to its trigger', async ({ page }) => {
    const trigger = page.getByTestId('dev-ui-dialog-open');
    await trigger.click();
    await expect(page.getByTestId('dev-ui-dialog-content')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('dev-ui-dialog-content')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('ConfirmDialog shows its pending label until the action resolves', async ({ page }) => {
    await page.getByTestId('dev-ui-confirm-open').click();
    const confirm = page.getByTestId('dev-ui-confirm-action');
    await confirm.click();
    await expect(confirm).toHaveAttribute('aria-busy', 'true');
    await expect(confirm).toContainText('Removing');
    await expect(page.getByTestId('toast').filter({ hasText: 'Access removed' })).toBeVisible();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId('dev-ui-confirm-open')).toBeFocused();
  });

  test('an error toast persists, F6 reaches it and Escape dismisses it', async ({ page }) => {
    await page.getByTestId('dev-ui-toast-error').click();
    const toast = page.getByTestId('toast').filter({ hasText: "Plex didn't answer" });
    await expect(toast).toBeVisible();
    await page.waitForTimeout(6000);
    await expect(toast).toBeVisible();

    await page.keyboard.press('F6');
    await expect(page.getByTestId('toast-viewport')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(toast).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toast).toHaveCount(0);
  });

  test('the menu opens from the keyboard and Escape returns focus', async ({ page }) => {
    const trigger = page.getByTestId('dev-ui-menu-open');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByTestId('dev-ui-menu-content');
    await expect(menu).toBeVisible();
    // Opening from the keyboard highlights the first item.
    await expect(page.getByTestId('dev-ui-menu-first')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('below md the dialog is a bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('dev-ui-dialog-open').click();
    const sheet = page.getByTestId('dev-ui-dialog-content');
    // Poll past the 240ms slide-in.
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box && { width: box.width, bottom: Math.round(box.y + box.height) };
      })
      .toEqual({ width: 390, bottom: 844 });
  });
});
