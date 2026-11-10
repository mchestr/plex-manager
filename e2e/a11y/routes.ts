import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth';
import { CLEANUP_A11Y_PREFIX, CLEANUP_A11Y_RULE_IDS, CLEANUP_MEMBERS, cleanupA11ySeedIds } from '../helpers/cleanup-fixtures';
import { clearCleanupA11yRules, resetCleanupMemberA11y, seedCleanupA11y, useCleanupServices } from '../helpers/seed-cleanup';
import {
  VISUAL_INVITE_IDS,
  VISUAL_INVITES,
  VISUAL_ONBOARDING_USER,
  VISUAL_REWIND_ID,
  VISUAL_REWIND_YEAR,
} from '../helpers/seed-fixtures';
import { editSection } from '../helpers/settings';
import { FAR_FUTURE, LONG_AGO, unsubscribePath } from '../helpers/unsubscribe-token';
import { settlePage } from '../visual/visual-test';
import { A11Y_CONVERSATION_ID, A11Y_SHARE_TOKEN, clearA11yCleanupServices, clearA11yShareVisits } from './seed';

/**
 * Every page under `app/` the axe spec scans, with the seeded ids its detail
 * routes need (`e2e/a11y/seed.ts`). Later steps add routes here: P3.2's
 * landmarks spec reads this table, and P5.4 adds the Rewind story.
 *
 * The media cleanup rows (UX 11.5, TS 16.5) come last, in the table order of
 * UX 11.5: the routes run in order on one worker, and `beforeAll` seeds once.
 * The admin rows reset with `seedCleanupA11y`, "first use" and "recipe
 * sheet" with `clearCleanupA11yRules` after them, and the turn-on row and
 * the member rows with `resetCleanupMemberA11y`, which also points the Plex
 * row at the Plex mock (`clearA11yFixtures()` puts it back). "Use this
 * recipe" needs Tautulli, so "recipe sheet" also points the service rows at
 * the mocks, and the member rows delete them again first.
 *
 * Two kinds of text are out of axe's reach, and their contrast reads as
 * `color-contrast` incomplete: text outside the viewport inside a horizontal
 * scroller (the Home strips, the phone Results tabs), and text under a fixed
 * bar (the phone count bar over the editor). The rows that show them hide
 * the scroller items that are out of sight (`hideScrolledOut`), and the phone
 * row makes the viewport as tall as the page.
 */

export type A11yAudience = 'public' | 'member' | 'admin';

export interface A11yRoute {
  path: string;
  /** Names the route in the baseline key instead of `path`, for a path that holds a token. */
  name?: string;
  as: A11yAudience;
  /** Test id that marks the page as loaded. */
  ready: string;
  /** Names an interactive state that `setup` opens; part of the baseline key. */
  state?: string;
  /** Opens the interactive state after `ready` shows. */
  setup?: (page: Page) => Promise<void>;
  /** Seeded user to sign in as, instead of the audience's default. */
  userId?: string;
  /** Turns Stripe on (`e2e/helpers/stripe.ts`) for this scan. */
  stripe?: boolean;
  /**
   * The page moves focus to its `h1` once it loads (the turn-on page, UX 4.6
   * behaviour 1). The landmarks spec then checks the skip link from its own
   * focus, because the first Tab moves on inside `main`.
   */
  focusesTitle?: boolean;
  /**
   * Resets rows that earlier routes write and this one reads, so the scan
   * sees the same data whichever routes ran before it in this worker.
   */
  reset?: () => Promise<void>;
}

export interface A11ySetupRoute {
  /** The step's number in the baseline key, kept from before P10.24's step ids. */
  step: number;
  /** The `Setup.currentStepId` the wizard is reopened at. */
  stepId: 'plex' | 'overseerr';
  ready: string;
}

/** The baseline key of a route. */
export function routeName(route: A11yRoute): string {
  return `${route.as} ${route.name ?? route.path}${route.state ? ` [${route.state}]` : ''}`;
}

export function setupRouteName(route: A11ySetupRoute): string {
  return `public /setup [step ${route.step}]`;
}

/** The seeded user a route signs in as, or `null` when signed out. */
export function routeUserId(route: A11yRoute): string | null {
  if (route.userId) return route.userId;
  if (route.as === 'admin') return TEST_USERS.ADMIN.id;
  if (route.as === 'member') return TEST_USERS.REGULAR.id;
  return null;
}

async function openWith(page: Page, trigger: string, opened: string): Promise<void> {
  await page.getByTestId(trigger).click();
  // A Base UI popup mounts on an animation frame, and the scan's clock is paused.
  await page.clock.runFor(100);
  await expect(page.getByTestId(opened)).toBeVisible();
}

/**
 * Presses `trigger` until `opened` shows. A press before hydration does
 * nothing, so it presses again, but never once `opened` shows. The paused
 * clock runs between tries, for popups that mount on an animation frame.
 */
async function pressUntil(page: Page, trigger: Locator, opened: Locator): Promise<void> {
  await expect(async () => {
    if (!(await opened.isVisible())) await trigger.click({ timeout: 2000 });
    await page.clock.runFor(100);
    await expect(opened).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

/** `pressUntil` with two test ids. */
function openUntil(page: Page, trigger: string, opened: string): Promise<void> {
  return pressUntil(page, page.getByTestId(trigger), page.getByTestId(opened));
}

/** The test id of the first element whose test id starts with `start` and ends with `end`. */
async function firstTestId(page: Page, start: string, end: string, not?: string): Promise<string> {
  const selector = `[data-testid^="${start}"][data-testid$="${end}"]${not ? `:not([data-testid$="${not}"])` : ''}`;
  const first = page.locator(selector).first();
  await expect(first).toBeVisible();
  const id = await first.getAttribute('data-testid');
  if (!id) throw new Error(`No element matches ${selector}`);
  return id;
}

/** Ticks the first two rows of the Leaving soon list. A press before hydration ticks nothing, and a press on a ticked box would untick it. */
async function selectTwoRows(page: Page): Promise<void> {
  const boxes = page.locator('[data-testid^="admin-cleanup-leaving-row-"][data-testid$="-select"]');
  await expect(async () => {
    for (const box of [boxes.nth(0), boxes.nth(1)]) {
      if ((await box.getAttribute('aria-checked')) !== 'true') await box.click({ timeout: 2000 });
    }
    await page.clock.runFor(100);
    await expect(page.getByTestId('admin-cleanup-leaving-bulk')).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
}

/** A live rule with a changed value, then Save: the impact dialog of the save (UX 4.3.9). */
async function openImpactDialog(page: Page): Promise<void> {
  const editor = page.getByTestId('admin-cleanup-condition-editor');
  await openUntil(page, 'admin-cleanup-condition-c1-value', 'admin-cleanup-condition-editor');
  // Two years: the titles played in the second year leave Leaving soon
  await page.getByTestId('admin-cleanup-condition-editor-preset-2-years').click();
  await page.getByTestId('admin-cleanup-condition-editor-done').click();
  await page.clock.runFor(100);
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('admin-cleanup-condition-c1-value')).toContainText('2 years');
  // The preview of the draft carries the impact that the save shows
  await settlePage(page);
  await openUntil(page, 'admin-cleanup-editor-save', 'admin-cleanup-impact-dialog');
}

/**
 * Hides each item of a horizontal scroller that lies wholly outside the
 * scroller's visible box. Nobody sees it before a scroll, and axe cannot
 * read text outside the viewport, so its contrast would read as incomplete.
 */
async function hideScrolledOut(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const scroller of document.querySelectorAll<HTMLElement>('body *')) {
      if (getComputedStyle(scroller).overflowX === 'visible' || scroller.scrollWidth <= scroller.clientWidth) continue;
      const box = scroller.getBoundingClientRect();
      for (const item of Array.from(scroller.children)) {
        const rect = item.getBoundingClientRect();
        if (item instanceof HTMLElement && (rect.right <= box.left || rect.left >= box.right)) item.style.visibility = 'hidden';
      }
    }
  });
}

/**
 * The phone editor (UX 11.5 row 14): 390 x 844 switches the layout, then the
 * viewport grows to the height of the page, so the fixed count bar and tab
 * bar cover only the space that the page keeps free for them.
 */
async function phoneEditor(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(100);
  await expect(page.getByTestId('admin-cleanup-condition-c2-box')).toBeVisible();
  await settlePage(page);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 390, height });
  await settlePage(page);
  await hideScrolledOut(page);
}

/** "recipe sheet": "Use this recipe" shows only with Tautulli set up, so the rows point at the mocks, with prefix ids. */
async function resetRecipeSheet(): Promise<void> {
  await clearCleanupA11yRules();
  await useCleanupServices(CLEANUP_A11Y_PREFIX);
}

/** The member rows: the service rows of "recipe sheet" go first, so every member row reads the same data, on a retry too. */
async function resetCleanupMember(): Promise<void> {
  await clearA11yCleanupServices();
  await resetCleanupMemberA11y();
}

const regularId = TEST_USERS.REGULAR.id;
const cleanupRule = {
  dry: `/admin/cleanup/rules/${CLEANUP_A11Y_RULE_IDS.dry}`,
  live: `/admin/cleanup/rules/${CLEANUP_A11Y_RULE_IDS.live}`,
};
const liveBatch = `admin-cleanup-batch-${cleanupA11ySeedIds().batches.live}`;
const cleanupMember = CLEANUP_MEMBERS.member.id;

export const A11Y_ROUTES: A11yRoute[] = [
  // Public
  { path: '/', as: 'public', ready: 'sign-in-button' },
  { path: `/invite/${VISUAL_INVITES.valid}`, as: 'public', ready: 'valid-invite-heading' },
  { path: `/invite/${VISUAL_INVITES.expired}`, as: 'public', ready: 'invalid-invite-heading' },
  { path: '/auth/denied', as: 'public', ready: 'access-denied-heading' },
  // No PIN in the URL: the callback's error state.
  { path: '/auth/callback/plex', as: 'public', ready: 'plex-callback-error-heading' },
  { path: `/rewind/s/${A11Y_SHARE_TOKEN}`, as: 'public', ready: 'rewind-share-v2' },
  { path: '/a11y-missing-page', as: 'public', ready: 'status-screen' },
  // The link in an email: a good token asks first, an expired one shows the dead-link screen.
  // Fixed expiry dates keep the paths, and the test titles of the specs that name them, the same in every worker.
  { path: unsubscribePath(regularId, FAR_FUTURE), name: '/email/unsubscribe', as: 'public', ready: 'unsubscribe-question' },
  {
    path: unsubscribePath(regularId, LONG_AGO),
    name: '/email/unsubscribe',
    state: 'dead link',
    as: 'public',
    ready: 'unsubscribe-dead-link',
  },

  // Member
  { path: '/', as: 'member', ready: 'home-greeting' },
  { path: '/rewind', as: 'member', ready: 'rewind-article-mode' },
  { path: `/rewind/${VISUAL_REWIND_YEAR}`, as: 'member', ready: 'rewind-article-mode' },
  { path: '/onboarding', as: 'member', userId: VISUAL_ONBOARDING_USER.id, ready: 'onboarding-welcome-heading' },
  { path: '/discord/link', as: 'member', ready: 'discord-link-panel' },
  { path: '/account', as: 'member', ready: 'account-notifications' },
  { path: '/subscribe', as: 'member', stripe: true, ready: 'subscribe-page' },
  { path: '/subscribe/success', as: 'member', stripe: true, ready: 'subscribe-success-page' },

  // Admin (`/admin` itself redirects to `/admin/users`)
  { path: '/admin/users', as: 'admin', ready: 'admin-users-header' },
  {
    path: '/admin/users',
    as: 'admin',
    state: 'role filter open',
    ready: 'admin-users-filters-filter-role',
    setup: (page) => openWith(page, 'admin-users-filters-filter-role', 'admin-users-filters-filter-role-option-admin'),
  },
  // Its Visits and Rewind table count the share visit the public share route records.
  { path: `/admin/users/${regularId}`, as: 'admin', ready: 'admin-user-header', reset: clearA11yShareVisits },
  { path: `/admin/users/${regularId}/rewind/2026`, as: 'admin', ready: 'admin-rewind-preview-header' },
  { path: '/admin/invites', as: 'admin', ready: 'generate-invite-button' },
  {
    path: '/admin/invites',
    as: 'admin',
    state: 'create dialog open',
    ready: 'generate-invite-button',
    setup: (page) => openWith(page, 'generate-invite-button', 'admin-invites-create-dialog'),
  },
  {
    path: '/admin/invites',
    as: 'admin',
    state: 'confirm dialog open',
    ready: `admin-invites-actions-${VISUAL_INVITE_IDS.valid}`,
    setup: async (page) => {
      await openWith(page, `admin-invites-actions-${VISUAL_INVITE_IDS.valid}`, `admin-invites-actions-${VISUAL_INVITE_IDS.valid}-delete`);
      await openWith(page, `admin-invites-actions-${VISUAL_INVITE_IDS.valid}-delete`, 'admin-invites-delete-dialog');
    },
  },
  { path: `/admin/invites/${VISUAL_INVITE_IDS.valid}`, as: 'admin', ready: 'admin-invite-header' },
  // The section strip (Users, Invites, Affiliates) above the page's own tabs: two tablists on one page
  { path: '/admin/affiliates', as: 'admin', ready: 'admin-affiliates-header' },
  { path: '/admin/announcements', as: 'admin', ready: 'admin-announcements-header' },
  { path: '/admin/watchlist', as: 'admin', ready: 'admin-watchlist-header' },
  { path: '/admin/inactivity', as: 'admin', ready: 'admin-inactivity-header' },
  { path: '/admin/request-limits', as: 'admin', ready: 'admin-request-limits-header' },
  { path: '/admin/audit', as: 'admin', ready: 'admin-audit-header' },
  { path: '/admin/cost-analysis', as: 'admin', ready: 'admin-cost-analysis-header' },
  { path: '/admin/discord', as: 'admin', ready: 'discord-status' },
  { path: '/admin/discord/settings', as: 'admin', ready: 'settings-discord-section' },
  { path: '/admin/rewind/playground', as: 'admin', ready: 'admin-rewind-playground-header' },
  { path: '/admin/rewind/settings', as: 'admin', ready: 'settings-rewind-section' },
  { path: '/admin/queues', as: 'admin', ready: 'queue-status' },
  { path: '/admin/settings', as: 'admin', ready: 'settings-plex-section' },
  // A section in edit mode: its form, Save and Cancel, beside the read-only sections
  {
    path: '/admin/settings',
    as: 'admin',
    ready: 'settings-plex-section',
    state: 'plex editing',
    setup: (page) => editSection(page, 'plex'),
  },
  // The public share route records a visit; a worker restart's re-seed drops it.
  { path: '/admin/shares', as: 'admin', ready: 'admin-shares-header', reset: clearA11yShareVisits },
  // No chat model in the seed, so the page also shows its "assistant is off" state
  { path: '/admin/assistant', as: 'admin', ready: 'admin-chat-input' },
  { path: `/admin/assistant?conversation=${A11Y_CONVERSATION_ID}`, as: 'admin', ready: 'admin-chat-answer' },
  { path: '/admin/ai', as: 'admin', ready: 'admin-ai-activity-header' },
  { path: '/admin/ai/settings', as: 'admin', ready: 'admin-ai-settings-header' },
  { path: '/admin/ai/visual-llm-usage-1', as: 'admin', ready: 'admin-ai-activity-detail-heading' },
  {
    path: `/admin/ai/conversation/${A11Y_CONVERSATION_ID}`,
    as: 'admin',
    ready: 'admin-ai-conversation-heading',
  },
  {
    path: `/admin/wrapped/${VISUAL_REWIND_ID}/history/visual-llm-usage-1`,
    as: 'admin',
    ready: 'admin-wrapped-history-heading',
  },

  // Media cleanup, admin (UX 11.5 rows 1 to 15): the seed holds both fixed rules
  { path: '/admin/cleanup', as: 'admin', ready: 'admin-cleanup-page', reset: seedCleanupA11y },
  { path: '/admin/cleanup?tab=leaving-soon', as: 'admin', ready: 'admin-cleanup-leaving', reset: seedCleanupA11y },
  {
    path: '/admin/cleanup?tab=leaving-soon',
    as: 'admin',
    state: 'selection',
    ready: 'admin-cleanup-leaving',
    setup: selectTwoRows,
    reset: seedCleanupA11y,
  },
  // The deletion batch of the Review first rule; the dialog lists its titles
  {
    path: '/admin/cleanup?tab=leaving-soon',
    as: 'admin',
    state: 'approve dialog',
    ready: `${liveBatch}-approve`,
    setup: (page) => openUntil(page, `${liveBatch}-approve`, 'admin-cleanup-approve-dialog'),
    reset: seedCleanupA11y,
  },
  { path: '/admin/cleanup?tab=kept', as: 'admin', ready: 'admin-cleanup-kept', reset: seedCleanupA11y },
  { path: '/admin/cleanup?tab=history', as: 'admin', ready: 'admin-cleanup-runs', reset: seedCleanupA11y },
  { path: '/admin/cleanup?tab=settings', as: 'admin', ready: 'settings-cleanup-feature-section', reset: seedCleanupA11y },
  {
    path: '/admin/cleanup?tab=settings',
    as: 'admin',
    state: 'protections editing',
    ready: 'settings-cleanup-protections-section',
    setup: (page) => editSection(page, 'cleanup-protections'),
    reset: seedCleanupA11y,
  },
  { path: '/admin/cleanup/rules/new?level=movie', as: 'admin', ready: 'admin-cleanup-editor-page', reset: seedCleanupA11y },
  { path: cleanupRule.dry, as: 'admin', ready: 'admin-cleanup-editor-page', reset: seedCleanupA11y },
  // After UX 10.1 item 7 the id matches only the desktop token; the phone box has its own
  {
    path: cleanupRule.dry,
    as: 'admin',
    state: 'condition editor',
    ready: 'admin-cleanup-condition-c2-value',
    setup: (page) => openUntil(page, 'admin-cleanup-condition-c2-value', 'admin-cleanup-condition-editor'),
    reset: seedCleanupA11y,
  },
  {
    path: cleanupRule.dry,
    as: 'admin',
    state: 'why',
    ready: 'admin-cleanup-editor-page',
    setup: async (page) => {
      const why = await firstTestId(page, 'admin-cleanup-results-row-', '-why');
      await openUntil(page, why, 'admin-cleanup-why');
    },
    reset: seedCleanupA11y,
  },
  {
    path: cleanupRule.live,
    as: 'admin',
    state: 'impact dialog',
    ready: 'admin-cleanup-editor-page',
    setup: openImpactDialog,
    reset: seedCleanupA11y,
  },
  // The table has no viewport field: the phone condition boxes must hold no nested button (axe nested-interactive)
  { path: cleanupRule.dry, as: 'admin', state: 'phone', ready: 'admin-cleanup-editor-page', setup: phoneEditor, reset: seedCleanupA11y },
  // Its member count reads plex.tv
  { path: `${cleanupRule.dry}/turn-on`, as: 'admin', ready: 'admin-cleanup-turn-on-page', focusesTitle: true, reset: resetCleanupMemberA11y },
  // No rule: the first-use recipes and the recipe Sheet (UX 11.5 rows 16 and 17)
  { path: '/admin/cleanup', as: 'admin', state: 'first use', ready: 'admin-cleanup-recipes', reset: clearCleanupA11yRules },
  {
    path: '/admin/cleanup',
    as: 'admin',
    state: 'recipe sheet',
    ready: 'admin-cleanup-recipe-never-watched-movies-use',
    setup: (page) => openUntil(page, 'admin-cleanup-recipe-never-watched-movies-use', 'admin-cleanup-recipe-sheet'),
    reset: resetRecipeSheet,
  },

  // Media cleanup, member (UX 11.5 rows 18 to 22): last, with the Plex row on the Plex mock
  { path: '/leaving-soon', as: 'member', userId: cleanupMember, ready: 'leaving-soon-page', reset: resetCleanupMember },
  {
    path: '/leaving-soon',
    as: 'member',
    userId: cleanupMember,
    state: 'kept',
    ready: 'leaving-soon-page',
    // The Keep toast with its Undo action
    setup: async (page) => {
      const keep = await firstTestId(page, 'leaving-soon-card-', '-keep', '-end-keep');
      await openUntil(page, keep, 'toast-action');
    },
    reset: resetCleanupMember,
  },
  {
    path: '/leaving-soon',
    as: 'member',
    userId: CLEANUP_MEMBERS.noshare.id,
    state: 'empty',
    ready: 'leaving-soon-empty',
    reset: resetCleanupMember,
  },
  // New states, so their keys differ from the rows of `/` and `/account` above
  {
    path: '/',
    as: 'member',
    userId: cleanupMember,
    state: 'leaving soon row',
    ready: 'home-leaving-soon-row',
    setup: hideScrolledOut,
    reset: resetCleanupMember,
  },
  { path: '/account', as: 'member', userId: cleanupMember, state: 'keeps', ready: 'account-keeps', reset: resetCleanupMember },
];

/** `/setup` needs an incomplete setup, so these run in the `setup-wizard` project. */
export const A11Y_SETUP_ROUTES: A11ySetupRoute[] = [
  { step: 1, stepId: 'plex', ready: 'setup-form-submit' },
  { step: 3, stepId: 'overseerr', ready: 'setup-form-submit' },
];

export const ALL_ROUTE_NAMES: string[] = [
  ...A11Y_ROUTES.map(routeName),
  ...A11Y_SETUP_ROUTES.map(setupRouteName),
];
