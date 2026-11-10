import { expect, type Page } from '@playwright/test';

import { WAIT_TIMEOUTS } from './test-utils';

/**
 * The test id scan (P10.11, TS 16.6, UX 10.1 items 6 and 7): every
 * interactive element inside a shell carries a `data-testid`, on itself or on
 * its direct parent (the primitive root around it), so the specs never have
 * to select by DOM structure, class or text.
 *
 * - The root is the shell: `admin-shell` on admin routes,
 *   `app-shell` on member routes (`components/shell/app-shell.tsx`).
 * - Popups that are closed are not in the DOM, and the hidden inputs that
 *   Base UI renders beside its controls are `aria-hidden`, so neither counts.
 *   Hidden and inert elements do not count either.
 * - With `unique: true`, the scan also reports every media cleanup test id
 *   that two or more elements share, hidden ones included: Playwright
 *   locators are strict and count hidden elements, so a layout switch that
 *   keeps two copies with one id breaks every `getByTestId()` on it
 *   (ux-a11y-r3-2). Only the cleanup prefixes count, so shell ids and the
 *   portaled toast ids cannot fail it, and the existing admin tables keep
 *   their repeated fixed cell ids (`components/admin/users/user-cells.tsx`).
 *
 * @module e2e/helpers/testid-scan
 */

/** The elements a person can use: each needs a test id. */
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

/** The test id prefixes of media cleanup (UX 10.1 items 1 and 4.1), the only ids the duplicate check reads. */
export const CLEANUP_TESTID_PREFIXES = ['admin-cleanup-', 'settings-cleanup-', 'leaving-soon-', 'home-leaving-soon-', 'account-keeps-'] as const;

export type ScanRoot = 'admin-shell' | 'app-shell';

export interface TestIdScanOptions {
  /** The test id of the shell to scan inside. */
  root: ScanRoot;
  /** Also report the cleanup test ids that two or more elements share. */
  unique?: boolean;
}

export interface TestIdScan {
  /** Each interactive element in the root without a test id, as a short description. */
  untagged: string[];
  /** Each cleanup test id that two or more elements share, with the count. Empty without `unique`. */
  shared: string[];
}

/**
 * Waits until the shell shows and every streamed section has replaced its
 * skeleton, so the scan reads the page the route settles into.
 */
export async function waitForScanRoot(page: Page, root: ScanRoot): Promise<void> {
  await expect(page.getByTestId(root)).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
  await expect
    .poll(() => page.locator('[data-slot$="skeleton"]').count(), { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION })
    .toBe(0);
}

/** Scans the page as it is now. Call {@link waitForScanRoot} first. */
export async function scanTestIds(page: Page, { root, unique = false }: TestIdScanOptions): Promise<TestIdScan> {
  return page.evaluate(
    ({ selector, root, unique, prefixes }) => {
      const shell = document.querySelector(`[data-testid="${root}"]`);
      const untagged = !shell
        ? [`no ${root} on the page`]
        : Array.from(shell.querySelectorAll<HTMLElement>(selector))
            .filter((el) => el.closest('[aria-hidden="true"], [inert]') === null)
            .filter((el) => !(el instanceof HTMLInputElement && el.type === 'hidden'))
            .filter((el) => el.checkVisibility())
            .filter((el) => !el.hasAttribute('data-testid') && !el.parentElement?.hasAttribute('data-testid'))
            .map((el) => {
              const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? '';
              const href = el.getAttribute('href');
              return `<${el.tagName.toLowerCase()}${href ? ` href="${href}"` : ''}> ${name}`.trim();
            });
      if (!unique) return { untagged, shared: [] };

      // The whole document, hidden elements included: a strict locator counts them all
      const counts = new Map<string, number>();
      for (const el of document.querySelectorAll('[data-testid]')) {
        const id = el.getAttribute('data-testid') ?? '';
        if (prefixes.some((prefix) => id.startsWith(prefix))) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const shared = [...counts].filter(([, count]) => count > 1).map(([id, count]) => `${id} (${count} elements)`);
      return { untagged, shared };
    },
    { selector: INTERACTIVE, root, unique, prefixes: [...CLEANUP_TESTID_PREFIXES] }
  );
}
