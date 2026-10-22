import { TEST_USERS } from '../fixtures/auth';
import { test } from '../fixtures/session';
import { setLightThemeFlag } from '../helpers/light-theme';

/** Turns the light theme's flag on for the light projects (P10.10); `light-theme.teardown.ts` turns it off. */
test('turn the light theme flag on', async ({ page, signIn }) => {
  await signIn(TEST_USERS.ADMIN.id);
  await setLightThemeFlag(page, true);
});
