import { TEST_USERS } from '../fixtures/auth';
import { expect, test } from '../fixtures/session';
import { CLEANUP_MEMBERS, cleanupSeedIds } from '../helpers/cleanup-fixtures';
import { clearCleanup, restorePlex, seedCleanup, useCleanupPlex, wipeCleanup } from '../helpers/seed-cleanup';
import { scanTestIds, waitForScanRoot, type ScanRoot } from '../helpers/testid-scan';

/**
 * Test ids on the media cleanup routes (TS 16.6 items 2 and 2a, UX 10.1
 * items 6 and 7): every interactive element carries a test id, on itself or
 * its direct parent, and no cleanup test id is on two elements, hidden ones
 * included.
 *
 * At 1440 x 900: the five `/admin/cleanup` tabs, the editor of a Dry run
 * rule, of a live rule and of a new rule, the turn-on page, and the member
 * routes as `e2e-cleanup-member`. At 390 x 844: the editors and the Leaving
 * soon tab again, for the phone-only controls (the condition boxes, the
 * count bar, the stats toggle, "Review each" and the batch title list).
 *
 * Each route opens with `page.goto()`, never through a link of the app: the
 * router keeps visited routes in a hidden Activity, test ids included (TS
 * 12.1 rule 8, architecture-r3-6). The member pages and the turn-on member
 * count read plex.tv and the Plex server, so the spec points the Plex row at
 * the mocks first (`useCleanupPlex()`) and puts it back after.
 */

const IDS = cleanupSeedIds();
const MEMBER = CLEANUP_MEMBERS.member.id;

interface ScanRoute {
  path: string;
  root: ScanRoot;
  userId: string;
}

const admin = (path: string): ScanRoute => ({ path, root: 'admin-shell', userId: TEST_USERS.ADMIN.id });
const member = (path: string): ScanRoute => ({ path, root: 'app-shell', userId: MEMBER });

const EDITORS = [
  admin(`/admin/cleanup/rules/${IDS.rules.dry}`),
  admin(`/admin/cleanup/rules/${IDS.rules.review}`),
  admin('/admin/cleanup/rules/new?level=movie'),
];

const DESKTOP_ROUTES: ScanRoute[] = [
  admin('/admin/cleanup'),
  admin('/admin/cleanup?tab=leaving-soon'),
  admin('/admin/cleanup?tab=kept'),
  admin('/admin/cleanup?tab=history'),
  admin('/admin/cleanup?tab=settings'),
  ...EDITORS,
  admin(`/admin/cleanup/rules/${IDS.rules.dry}/turn-on`),
  member('/leaving-soon'),
  member('/'),
  member('/account'),
];

const PHONE_ROUTES: ScanRoute[] = [...EDITORS, admin('/admin/cleanup?tab=leaving-soon')];

const WIDTHS = [
  { name: '1440 x 900', viewport: { width: 1440, height: 900 }, routes: DESKTOP_ROUTES },
  { name: '390 x 844', viewport: { width: 390, height: 844 }, routes: PHONE_ROUTES },
] as const;

test.describe('Media cleanup test ids', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedCleanup();
    await useCleanupPlex();
  });

  test.afterAll(async () => {
    await wipeCleanup();
    await clearCleanup();
    await restorePlex();
  });

  for (const { name, viewport, routes } of WIDTHS) {
    test.describe(`at ${name}`, () => {
      test.use({ viewport });

      for (const route of routes) {
        const who = route.root === 'admin-shell' ? 'admin' : 'member';
        test(`${who} ${route.path}: every interactive element has a test id, and no cleanup id repeats`, async ({ page, signIn }) => {
          await signIn(route.userId);
          await page.goto(route.path);
          await waitForScanRoot(page, route.root);

          const scan = await scanTestIds(page, { root: route.root, unique: true });
          expect(scan.untagged, 'interactive elements without a test id').toEqual([]);
          expect(scan.shared, 'cleanup test ids on two or more elements').toEqual([]);
        });
      }
    });
  }
});
