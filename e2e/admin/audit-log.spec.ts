import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * The audit log (/admin/audit): an admin finds seeded events with their names
 * and summaries, narrows them by category through the URL, scopes the log to
 * a person from their name, and opens an event to read its stored details.
 * The events involve a member made for this run, so the log scoped to them
 * holds only these rows whatever else the database has.
 */
const RUN = Date.now().toString(36);
const PREFIX = `e2e-audit-log-${RUN}`;
const MEMBER_ID = `${PREFIX}-member`;
const UNSHARED_ID = `${PREFIX}-unshared`;
const SETTINGS_ID = `${PREFIX}-settings`;

const rowOf = (id: string) => `admin-audit-row-${id}`;

test.describe('Admin audit log', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.create({ data: { id: MEMBER_ID, name: 'Audit Log Member' } });
      await prisma.auditLog.createMany({
        data: [
          {
            id: UNSHARED_ID,
            type: 'MEMBER_UNSHARED',
            actorUserId: TEST_USERS.ADMIN.id,
            targetUserId: MEMBER_ID,
            details: { status: 'removed', reason: 'inactivity', lastSeenAt: null, thresholdDays: 180 },
          },
          {
            id: SETTINGS_ID,
            type: 'CONFIG_CHANGED',
            actorUserId: MEMBER_ID,
            details: { section: 'plex', changedFields: ['url'], secretChanged: false },
          },
        ],
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.auditLog.deleteMany({ where: { id: { startsWith: PREFIX } } });
      await prisma.user.deleteMany({ where: { id: MEMBER_ID } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('lists the events involving a member, with names and summaries', async ({ adminPage: page }) => {
    await page.goto(`/admin/audit?member=${MEMBER_ID}`);
    await expect(page.getByTestId('admin-audit-header')).toContainText('Audit log', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('admin-audit-scope-member')).toContainText('Involving Audit Log Member');

    const unshared = page.getByTestId(rowOf(UNSHARED_ID));
    await expect(unshared).toContainText('Plex access removed');
    await expect(unshared).toContainText('Removed for inactivity, never seen');
    await expect(unshared.getByTestId(`admin-audit-actor-${UNSHARED_ID}`)).toHaveText(TEST_USERS.ADMIN.name);
    await expect(page.getByTestId(rowOf(SETTINGS_ID))).toContainText('plex: url');
    await expect(page.getByTestId('admin-audit-pagination-info')).toHaveText(/Showing all 2 events/);
  });

  test('the Category filter lands in the URL with a chip and narrows the list', async ({ adminPage: page }) => {
    await page.goto(`/admin/audit?member=${MEMBER_ID}`);
    await expect(page.getByTestId(rowOf(SETTINGS_ID))).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await page.getByTestId('admin-audit-filters-filter-category').click();
    await page.getByTestId('admin-audit-filters-filter-category-option-access').click();
    await expect(page).toHaveURL(/category=access/);
    await expect(page.getByTestId('admin-audit-filters-chip-category')).toContainText('Category: Plex and Jellyfin access');
    await expect(page.getByTestId(rowOf(UNSHARED_ID))).toBeVisible();
    await expect(page.getByTestId(rowOf(SETTINGS_ID))).toHaveCount(0);
  });

  test("a name scopes the log to that person, and the scope's link removes it", async ({ adminPage: page }) => {
    await page.goto(`/admin/audit?member=${MEMBER_ID}`);
    await page.getByTestId(`admin-audit-actor-${SETTINGS_ID}`).click();

    await expect(page).toHaveURL(new RegExp(`actor=${MEMBER_ID}`));
    await expect(page.getByTestId('admin-audit-scope-actor')).toContainText('By Audit Log Member');
    await expect(page.getByTestId(rowOf(SETTINGS_ID))).toBeVisible();
    await expect(page.getByTestId(rowOf(UNSHARED_ID))).toHaveCount(0);

    await page.getByTestId('admin-audit-scope-actor-clear').click();
    await expect(page).not.toHaveURL(/actor=/);
    await expect(page.getByTestId(rowOf(UNSHARED_ID))).toBeVisible();
  });

  test('opens an event with its stored details and the member', async ({ adminPage: page }) => {
    await page.goto(`/admin/audit?member=${MEMBER_ID}`);
    await page.getByTestId(`admin-audit-link-${UNSHARED_ID}`).click();

    await expect(page).toHaveURL(new RegExp(`/admin/audit/${UNSHARED_ID}$`));
    await expect(page.getByTestId('admin-audit-event-header')).toContainText('Plex access removed');
    await expect(page.getByTestId('admin-audit-event-type')).toContainText('MEMBER_UNSHARED');
    const details = page.getByTestId('admin-audit-event-details');
    await expect(details).toContainText('status');
    await expect(details).toContainText('thresholdDays');
    await expect(page.getByTestId('admin-audit-event-details-hidden')).toHaveCount(0);
    await expect(page.getByTestId('admin-audit-event-member-profile')).toHaveAttribute('href', `/admin/users/${MEMBER_ID}`);
  });
});
