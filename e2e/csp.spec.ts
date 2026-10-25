import type { Page, Response } from '@playwright/test';
import { TEST_USERS } from './fixtures/auth';
import { expect, test } from './fixtures/session';
import { A11Y_ROUTES, routeName, routeUserId, type A11yRoute } from './a11y/routes';
import { clearA11yFixtures, seedA11yFixtures } from './a11y/seed';
import { openStage } from './helpers/rewind-stage';
import { clearRewindSeed, REWIND_MEMBERS, seedRewind } from './helpers/seed-rewind';
import { resetStripeState, setStripeEnabled } from './helpers/stripe';

/**
 * The strict CSP (P11.20) on a production build, in `csp-chromium`,
 * `csp-webkit` and `csp-firefox`: every route in P1.7's axe table (signed
 * out, as a member and as an admin), the Rewind story, the share page and
 * `/subscribe` with Stripe on load with no `securitypolicyviolation` event,
 * and every `<script>` in the server HTML carries the response's nonce.
 */

test.skip(process.env.E2E_SERVER !== 'prod', 'Runs only against a production build: set E2E_SERVER=prod.');

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

/** Records each violation as "directive blocked-uri" from before the first script runs. */
async function collectViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations?.push(`${event.effectiveDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`);
    });
  });
}

function violations(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__cspViolations ?? []);
}

/** The nonce of the response's policy, and checks that every script tag in its HTML carries it. */
function expectNoncedScripts(response: Response | null, html: string): void {
  expect(response, 'the navigation has a response').not.toBeNull();
  const policy = response!.headers()['content-security-policy'];
  expect(policy).toContain("'strict-dynamic'");
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  expect(nonce).toBeTruthy();

  const tags = html.match(/<script\b[^>]*>/g) ?? [];
  expect(tags.length).toBeGreaterThan(0);
  for (const tag of tags) {
    expect(tag, 'every server-rendered script carries the nonce').toContain(`nonce="${nonce}"`);
  }
}

async function visit(page: Page, path: string, ready: string): Promise<void> {
  const response = await page.goto(path);
  // Read the body now: a client navigation after load (/rewind moves to the
  // current issue) lets Chromium discard it
  const html = (await response?.text()) ?? '';
  await expect(page.getByTestId(ready)).toBeVisible();
  await page.waitForLoadState('load');
  expectNoncedScripts(response, html);
}

/** One scan per page and audience: the interactive states of the axe table add no new page loads. */
const ROUTES: A11yRoute[] = A11Y_ROUTES.filter((route) => !route.state);

test.describe('Strict CSP', () => {
  test.beforeEach(async ({ page }) => {
    await collectViolations(page);
  });

  test.afterEach(async ({ page }) => {
    expect(await violations(page)).toEqual([]);
  });

  test.describe('axe routes', () => {
    test.beforeAll(seedA11yFixtures);
    test.afterAll(clearA11yFixtures);

    for (const route of ROUTES) {
      test(routeName(route), async ({ page, signIn }) => {
        const userId = routeUserId(route);
        if (userId) await signIn(userId);
        if (route.stripe) await setStripeEnabled(true, { configure: true });
        await route.reset?.();
        try {
          await visit(page, route.path, route.ready);
        } finally {
          if (route.stripe) await resetStripeState([TEST_USERS.REGULAR.id]);
        }
      });
    }
  });

  test.describe('Rewind story', () => {
    test.beforeAll(seedRewind);
    test.afterAll(clearRewindSeed);

    test('the story plays with no violation', async ({ page, signIn }) => {
      await signIn(REWIND_MEMBERS.median.id);
      await openStage(page);
      await page.getByTestId('rewind-cut-full').click();
      await page.keyboard.press('ArrowRight');
      await page.waitForLoadState('load');
    });
  });
});
