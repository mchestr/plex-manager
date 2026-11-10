import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearVisualFixtures, seedVisualFixtures, VISUAL_INVITE_IDS } from '../helpers/seed-fixtures';
import { scanTestIds, waitForScanRoot } from '../helpers/testid-scan';
import { ADMIN_NAV } from '../../lib/admin/nav';

/**
 * Test-id coverage (P10.11, UI-46, ui-design-system 6.3 and 9.5 item 10):
 * every interactive element in the admin shell and its `main` carries a
 * `data-testid`, on itself or on the primitive root around it, so the specs
 * never have to select by DOM structure, class or text.
 *
 * Visits every admin route in `lib/admin/nav.ts` and one seeded detail route
 * per area, with the scan of `e2e/helpers/testid-scan.ts` inside
 * `admin-shell`. Popups that are closed are not in the DOM, and hidden inputs
 * that Base UI renders beside its controls are `aria-hidden`, so neither
 * counts. The scan runs without `unique`: the admin tables repeat fixed cell
 * ids. `cleanup-testids.spec.ts` checks the media cleanup routes with it.
 * The audit event is seeded here, by an admin about the regular member, so
 * its page and the member's Audit tab both have a row with every link.
 */

const AUDIT_EVENT_ID = 'e2e-testid-audit-event';

const DETAIL_ROUTES = [
  `/admin/users/${TEST_USERS.REGULAR.id}`,
  `/admin/users/${TEST_USERS.REGULAR.id}?tab=audit`,
  `/admin/invites/${VISUAL_INVITE_IDS.valid}`,
  '/admin/ai/visual-llm-usage-1',
  '/admin/affiliates?tab=history',
  '/admin/affiliates?tab=settings',
  `/admin/audit/${AUDIT_EVENT_ID}`,
];

/** Each item's page and its section tabs' pages. */
const NAV_ROUTES = ADMIN_NAV.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]);

const ROUTES = [...new Set<string>([...NAV_ROUTES, ...DETAIL_ROUTES])];

test.describe('Admin test-id coverage', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedVisualFixtures();
    const prisma = createE2EPrismaClient();
    try {
      await prisma.auditLog.upsert({
        where: { id: AUDIT_EVENT_ID },
        create: {
          id: AUDIT_EVENT_ID,
          type: 'USER_ROLE_CHANGED',
          actorUserId: TEST_USERS.ADMIN.id,
          targetUserId: TEST_USERS.REGULAR.id,
          details: { previousRole: null, newRole: 'support' },
        },
        update: {},
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    await clearVisualFixtures();
    const prisma = createE2EPrismaClient();
    try {
      await prisma.auditLog.deleteMany({ where: { id: AUDIT_EVENT_ID } });
    } finally {
      await prisma.$disconnect();
    }
  });

  for (const route of ROUTES) {
    test(`every interactive element on ${route} has a data-testid`, async ({ adminPage }) => {
      await adminPage.goto(route);
      // Streamed sections replace their skeletons; check the page they settle into
      await waitForScanRoot(adminPage, 'admin-shell');

      expect((await scanTestIds(adminPage, { root: 'admin-shell' })).untagged).toEqual([]);
    });
  }
});
