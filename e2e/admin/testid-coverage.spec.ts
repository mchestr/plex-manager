import type { Page } from '@playwright/test';

import { expect, test, TEST_USERS } from '../fixtures/auth';
import { clearVisualFixtures, seedVisualFixtures, VISUAL_INVITE_IDS } from '../helpers/seed-fixtures';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';
import { ADMIN_NAV } from '../../lib/admin/nav';

/**
 * Test-id coverage (P10.11, UI-46, ui-design-system 6.3 and 9.5 item 10):
 * every interactive element in the admin shell and its `main` carries a
 * `data-testid`, on itself or on the primitive root around it, so the specs
 * never have to select by DOM structure, class or text.
 *
 * Visits every admin route in `lib/admin/nav.ts` and one seeded detail route
 * per area. Popups that are closed are not in the DOM, and hidden inputs that
 * Base UI renders beside its controls are `aria-hidden`, so neither counts.
 */

const INTERACTIVE = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[role="switch"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="checkbox"]',
].join(', ');

const DETAIL_ROUTES = [
  `/admin/users/${TEST_USERS.REGULAR.id}`,
  `/admin/invites/${VISUAL_INVITE_IDS.valid}`,
  '/admin/llm-usage/visual-llm-usage-1',
];

const ROUTES = [...new Set([...ADMIN_NAV.map((item) => item.href as string), ...DETAIL_ROUTES])];

/** Each interactive element in the shell without a test id, as a short description. */
async function untagged(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const shell = document.querySelector('[data-testid="admin-shell"]');
    if (!shell) return ['no admin shell on the page'];
    return Array.from(shell.querySelectorAll<HTMLElement>(selector))
      .filter((el) => el.closest('[aria-hidden="true"], [inert]') === null)
      .filter((el) => !(el instanceof HTMLInputElement && el.type === 'hidden'))
      .filter((el) => el.checkVisibility())
      .filter((el) => !el.hasAttribute('data-testid') && !el.parentElement?.hasAttribute('data-testid'))
      .map((el) => {
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? '';
        const href = el.getAttribute('href');
        return `<${el.tagName.toLowerCase()}${href ? ` href="${href}"` : ''}> ${name}`.trim();
      });
  }, INTERACTIVE);
}

test.describe('Admin test-id coverage', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedVisualFixtures();
  });

  test.afterAll(async () => {
    await clearVisualFixtures();
  });

  for (const route of ROUTES) {
    test(`every interactive element on ${route} has a data-testid`, async ({ adminPage }) => {
      await adminPage.goto(route);
      await expect(adminPage.getByTestId('admin-shell')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
      // Streamed sections replace their skeletons; check the page they settle into
      await expect
        .poll(() => adminPage.locator('[data-slot$="skeleton"]').count(), { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION })
        .toBe(0);

      expect(await untagged(adminPage)).toEqual([]);
    });
  }
});
