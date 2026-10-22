import { expect, test } from '../fixtures/auth';
import { signInAs } from '../fixtures/session';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * Removing a member (P11.13): the dialog lists the dry run's counts; a wrong
 * name keeps the destructive button disabled; the right name removes the
 * member, their session ends, and their row is gone from the users list.
 *
 * The member has no Plex or Jellyfin identity, subscription or Discord link,
 * so removal makes no call to a media server or Stripe.
 */

const MEMBER = { id: `p1113-remove-member-${Date.now()}`, name: 'Aaa Removable Member', email: 'p1113-remove@example.com' };

test.describe('Admin removes a member', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.create({
        data: { ...MEMBER, primaryAuthService: 'plex', onboardingStatus: { plex: true, jellyfin: false } },
      });
      await prisma.userMediaMark.create({
        data: { userId: MEMBER.id, mediaType: 'MOVIE', plexRatingKey: 'p1113-1', title: 'Marked', markType: 'FINISHED_WATCHING', markedVia: 'discord' },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.deleteMany({ where: { id: MEMBER.id } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('needs the name typed, then removes the member and ends their session', async ({ adminPage, browser, baseURL }) => {
    const memberContext = await browser.newContext();
    try {
      await signInAs(memberContext, baseURL!, MEMBER.id);
      const memberPage = await memberContext.newPage();

      await adminPage.goto(`/admin/users/${MEMBER.id}`);
      await adminPage.getByTestId('admin-remove-member-open').click();
      await expect(adminPage.getByTestId('admin-remove-member-preview')).toBeVisible();
      await expect(adminPage.getByTestId('admin-remove-member-count-userMediaMark')).toContainText('1');

      const button = adminPage.getByTestId('admin-remove-member-button');
      await adminPage.getByTestId('admin-remove-member-confirm-input').fill('Someone Else');
      await expect(button).toBeDisabled();

      await adminPage.getByTestId('admin-remove-member-confirm-input').fill(MEMBER.name);
      await expect(button).toBeEnabled();
      await button.click();

      await expect(adminPage).toHaveURL(/\/admin\/users(\?|$)/);
      await expect(adminPage.getByTestId(`admin-users-name-${MEMBER.id}`)).toHaveCount(0);

      await memberPage.goto('/');
      await expect(memberPage.getByTestId('sign-in-button')).toBeVisible();
      const session = await memberPage.request.get('/api/auth/session');
      expect(await session.json()).toEqual({});
    } finally {
      await memberContext.close();
    }
  });
});
