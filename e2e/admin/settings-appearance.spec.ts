import type { Page } from '@playwright/test';

import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { editSection } from '../helpers/settings';

/** A 1 x 1 red PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64',
);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 2"><rect width="10" height="2" fill="#E4202B"/></svg>');

/**
 * Chooses a file for a brand image slot until its preview shows: a change
 * before React hydrates the input does nothing.
 */
async function uploadImage(page: Page, kind: string, file: { name: string; mimeType: string; buffer: Buffer }) {
  const preview = page.getByTestId(`brand-image-${kind}-preview`);
  await expect(async () => {
    await page.getByTestId(`brand-image-${kind}-input`).setInputFiles(file);
    await expect(preview).toBeVisible({ timeout: 2000 });
  }).toPass();
}

/**
 * Settings, Appearance (the Silo-style theme): the name, sign-in line and
 * accent colour, and the uploaded wordmark, icon and login background, as
 * the admin shell and the signed-out sign-in screen draw them.
 */
test.describe('Settings: Appearance', () => {
  test.describe.configure({ mode: 'serial' });

  const prisma = createE2EPrismaClient();
  let before: { serverName: string | null; loginSubtitle: string | null; accentColor: string | null } | null = null;

  test.beforeAll(async () => {
    before = await prisma.config.findUnique({ where: { id: 'config' }, select: { serverName: true, loginSubtitle: true, accentColor: true } });
  });

  test.afterAll(async () => {
    await prisma.brandAsset.deleteMany({});
    await prisma.config.updateMany({
      where: { id: 'config' },
      data: { serverName: before?.serverName ?? null, loginSubtitle: before?.loginSubtitle ?? null, accentColor: before?.accentColor ?? null },
    });
    await prisma.$disconnect();
  });

  test('saves the name, subtitle and accent, and the page takes the colour', async ({ adminPage: page }) => {
    await page.goto('/admin/settings#appearance');
    await editSection(page, 'appearance');
    await page.getByTestId('appearance-server-name').fill('Mikeflix');
    await page.getByTestId('appearance-login-subtitle').fill('Movies and shows for the family');
    await page.getByTestId('appearance-accent-color').fill('#e4202b');
    await page.getByTestId('settings-appearance-save').click();

    await expect(page.getByTestId('settings-appearance-summary-server-name')).toContainText('Mikeflix');
    await expect(page.getByTestId('settings-appearance-summary-accent')).toContainText('#E4202B');
    await page.reload();
    await expect(page.getByTestId('brand-accent')).toHaveCount(1);
    const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
    expect(primary).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('refuses a colour that is not #RRGGBB', async ({ adminPage: page }) => {
    await page.goto('/admin/settings#appearance');
    await editSection(page, 'appearance');
    await page.getByTestId('appearance-accent-color').fill('red');
    await page.getByTestId('settings-appearance-save').click();
    await expect(page.getByTestId('accentColor-error')).toBeVisible();
  });

  test('uploads the wordmark and icon, and the shell and icons draw them', async ({ adminPage: page }) => {
    await page.goto('/admin/settings#brand-images');
    await uploadImage(page, 'wordmark', { name: 'wordmark.svg', mimeType: 'image/svg+xml', buffer: SVG });
    await uploadImage(page, 'icon', { name: 'icon.png', mimeType: 'image/png', buffer: PNG });

    await page.reload();
    await expect(page.getByTestId('brand-wordmark').first()).toHaveAttribute('alt', 'Mikeflix');
    const icon = await page.request.get('/icon/192');
    expect(icon.ok()).toBe(true);
    expect(icon.headers()['content-type']).toBe('image/png');
  });

  test('refuses a file of the wrong type for its slot', async ({ adminPage: page }) => {
    await page.goto('/admin/settings#brand-images');
    const refusal = page.getByText('Favicon must be a PNG, JPEG or SVG image');
    await expect(async () => {
      await page.getByTestId('brand-image-favicon-input').setInputFiles({ name: 'favicon.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
      await expect(refusal).toBeVisible({ timeout: 2000 });
    }).toPass();
    await expect(page.getByTestId('brand-image-favicon-preview')).toHaveCount(0);
  });

  test('the signed-out sign-in screen shows the subtitle, icon and background', async ({ adminPage, browser }) => {
    await adminPage.goto('/admin/settings#brand-images');
    await uploadImage(adminPage, 'login-background', { name: 'bg.png', mimeType: 'image/png', buffer: PNG });

    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('/');
      await expect(page.getByTestId('member-pass-subtitle')).toHaveText('Movies and shows for the family');
      await expect(page.getByTestId('brand-icon')).toBeVisible();
      await expect(page.getByTestId('public-shell')).toHaveAttribute('style', /\/api\/branding\/login-background\?v=/);
    } finally {
      await context.close();
    }
  });

  test('removing an image brings the default back', async ({ adminPage: page }) => {
    await page.goto('/admin/settings#brand-images');
    await expect(async () => {
      await page.getByTestId('brand-image-wordmark-remove').click();
      await expect(page.getByTestId('brand-image-wordmark-preview')).toHaveCount(0, { timeout: 2000 });
    }).toPass();
    await page.reload();
    await expect(page.getByTestId('brand-wordmark')).toHaveCount(0);
  });
});

test('a regular member cannot reach the Appearance settings', async ({ regularUserPage: page }) => {
  await page.goto('/admin/settings#appearance');
  await expect(page.getByTestId('settings-appearance-section')).toHaveCount(0);
  expect(TEST_USERS.REGULAR.isAdmin).toBe(false);
});
