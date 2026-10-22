import { TEST_USERS } from '../fixtures/auth';
import { test } from '../fixtures/session';
import { setLightThemeFlag } from '../helpers/light-theme';

/** Turns the light theme's flag off again after the light projects (P10.10): it ships off. */
test('turn the light theme flag off', async ({ page, signIn }) => {
  await signIn(TEST_USERS.ADMIN.id);
  await setLightThemeFlag(page, false);
});
