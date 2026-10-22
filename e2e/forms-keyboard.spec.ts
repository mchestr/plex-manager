import { expect, test, TEST_USERS } from './fixtures/auth';

/**
 * The form primitives from the keyboard (P3.5, UI-14) and their mobile font
 * size (UI-11): the users filter is a Base UI Select, and inputs are 16px
 * below `md` so iOS does not zoom on focus.
 */
test.describe('Form primitives', () => {
  test('the Role filter works from the keyboard and returns focus', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    const trigger = adminPage.getByTestId('admin-users-filters-filter-role');
    // The streamed page waits in a hidden segment until React reveals it, and
    // moving it into place drops focus given to it there.
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveText('All');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.focus();
    await adminPage.keyboard.press('ArrowDown');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(adminPage.getByRole('listbox')).toBeVisible();
    // The list opens on the selected option, All; Admin is the one below it.
    await expect(adminPage.getByTestId('admin-users-filters-filter-role-option-all')).toHaveAttribute('data-highlighted', '');
    await adminPage.keyboard.press('ArrowDown');
    await expect(adminPage.getByTestId('admin-users-filters-filter-role-option-admin')).toHaveAttribute('data-highlighted', '');
    await adminPage.keyboard.press('Enter');

    await expect(adminPage.getByRole('listbox')).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveText('Admin');
    await expect(adminPage).toHaveURL(/role=admin/);
    await expect(adminPage.getByTestId(`admin-users-row-${TEST_USERS.ADMIN.id}`)).toBeVisible();
    await expect(adminPage.getByTestId(`admin-users-row-${TEST_USERS.REGULAR.id}`)).toHaveCount(0);
  });

  test('inputs use 16px text at 390x844', async ({ adminPage }) => {
    await adminPage.setViewportSize({ width: 390, height: 844 });

    await adminPage.goto('/admin/cost-analysis');
    for (const id of ['cost-dates-from', 'cost-dates-to']) {
      await expect(adminPage.getByTestId(id)).toHaveCSS('font-size', '16px');
    }

    await adminPage.goto('/admin/discord');
    for (const id of ['discord-date-range-from', 'discord-date-range-to']) {
      await expect(adminPage.getByTestId(id)).toHaveCSS('font-size', '16px');
    }
  });

  test('the date inputs are labelled', async ({ adminPage }) => {
    await adminPage.goto('/admin/cost-analysis');
    await expect(adminPage.getByTestId('cost-dates-from')).toHaveAccessibleName('From');
    await expect(adminPage.getByTestId('cost-dates-to')).toHaveAccessibleName('To');

    await adminPage.goto('/admin/discord');
    await expect(adminPage.getByTestId('discord-date-range-from')).toHaveAccessibleName('From');
    await expect(adminPage.getByTestId('discord-date-range-to')).toHaveAccessibleName('To');
  });
});
