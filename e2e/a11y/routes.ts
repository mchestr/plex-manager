import { expect, type Page } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth';
import {
  VISUAL_INVITE_IDS,
  VISUAL_INVITES,
  VISUAL_ONBOARDING_USER,
  VISUAL_REWIND_ID,
  VISUAL_REWIND_YEAR,
} from '../helpers/seed-fixtures';
import { editSection } from '../helpers/settings';
import { A11Y_CONVERSATION_ID, A11Y_SHARE_TOKEN, clearA11yShareVisits } from './seed';

/**
 * Every page under `app/` the axe spec scans, with the seeded ids its detail
 * routes need (`e2e/a11y/seed.ts`). Later steps add routes here: P3.2's
 * landmarks spec reads this table, and P5.4 adds the Rewind story.
 */

export type A11yAudience = 'public' | 'member' | 'admin';

export interface A11yRoute {
  path: string;
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
  return `${route.as} ${route.path}${route.state ? ` [${route.state}]` : ''}`;
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

const regularId = TEST_USERS.REGULAR.id;

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
  { path: '/admin/announcements', as: 'admin', ready: 'admin-announcements-header' },
  { path: '/admin/watchlist', as: 'admin', ready: 'admin-watchlist-header' },
  { path: '/admin/cost-analysis', as: 'admin', ready: 'admin-cost-analysis-header' },
  { path: '/admin/discord', as: 'admin', ready: 'discord-status' },
  { path: '/admin/rewind/playground', as: 'admin', ready: 'admin-rewind-playground-header' },
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
  { path: '/admin/llm-usage', as: 'admin', ready: 'admin-llm-usage-header' },
  { path: '/admin/llm-usage/visual-llm-usage-1', as: 'admin', ready: 'admin-llm-usage-detail-heading' },
  {
    path: `/admin/llm-usage/conversation/${A11Y_CONVERSATION_ID}`,
    as: 'admin',
    ready: 'admin-llm-conversation-heading',
  },
  {
    path: `/admin/wrapped/${VISUAL_REWIND_ID}/history/visual-llm-usage-1`,
    as: 'admin',
    ready: 'admin-wrapped-history-heading',
  },
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
