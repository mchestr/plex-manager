import { expect, test, TEST_USERS } from './fixtures/auth';

/**
 * The form primitives from the keyboard (P3.5, UI-14) and their mobile font
 * size (UI-11): the users filter is a Base UI Select, and inputs are 16px
 * below `md` so iOS does not zoom on focus.
 */
test.describe('Form primitives', () => {
  test('the Plex access filter works from the keyboard and returns focus', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    const trigger = adminPage.getByTestId('users-filter-plex-access');
    // The streamed page waits in a hidden segment until React reveals it, and
    // moving it into place drops focus given to it there.
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveText('Yes');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.focus();
    await adminPage.keyboard.press('ArrowDown');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(adminPage.getByRole('listbox')).toBeVisible();
    // The list opens on the selected option, Yes; All is the one above it.
    await expect(adminPage.getByTestId('users-filter-plex-access-option-yes')).toHaveAttribute('data-highlighted', '');
    await adminPage.keyboard.press('ArrowUp');
    await expect(adminPage.getByTestId('users-filter-plex-access-option-all')).toHaveAttribute('data-highlighted', '');
    await adminPage.keyboard.press('Enter');

    await expect(adminPage.getByRole('listbox')).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveText('All');
    await expect(adminPage.getByTestId(`user-row-${TEST_USERS.ADMIN.id}`)).toBeVisible();
  });

  test('inputs use 16px text at 390x844', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 });

    await adminPage.goto('/admin/cost-analysis');
    for (const id of ['cost-start-date', 'cost-end-date']) {
      await expect(adminPage.getByTestId(id)).toHaveCSS('font-size', '16px');
    }

    await adminPage.goto('/admin/discord');
    for (const id of ['discord-start-date', 'discord-end-date']) {
      await expect(adminPage.getByTestId(id)).toHaveCSS('font-size', '16px');
    }
  });

  test('the date inputs are labelled', async ({ adminPage }) => {
    await adminPage.goto('/admin/cost-analysis');
    await expect(adminPage.getByTestId('cost-start-date')).toHaveAccessibleName('Start date');
    await expect(adminPage.getByTestId('cost-end-date')).toHaveAccessibleName('End date');

    await adminPage.goto('/admin/discord');
    await expect(adminPage.getByTestId('discord-start-date')).toHaveAccessibleName('Start date');
    await expect(adminPage.getByTestId('discord-end-date')).toHaveAccessibleName('End date');
  });
});
