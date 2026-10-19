import { expect, type Page } from '@playwright/test';
import { TEST_USERS } from '../fixtures/auth';
import {
  VISUAL_INVITE_IDS,
  VISUAL_INVITES,
  VISUAL_ONBOARDING_USER,
  VISUAL_REWIND_ID,
  VISUAL_REWIND_YEAR,
} from '../helpers/seed-fixtures';
import { A11Y_CONVERSATION_ID, A11Y_SHARE_TOKEN } from './seed';

/**
 * Every page under `app/` the axe spec scans, with the seeded ids its detail
 * routes need (`e2e/a11y/seed.ts`). Later steps add routes here: P3.2's
 * landmarks spec reads this table, and P5.4 adds the Rewind story.
 */

export type A11yAudience = 'public' | 'member' | 'admin';

export interface A11yRoute {
  path: string;
  as: A11yAudience;
  /** Test id that marks the page as loaded; `null` for Next's built-in 404, which has none. */
  ready: string | null;
  /** Names an interactive state that `setup` opens; part of the baseline key. */
  state?: string;
  /** Opens the interactive state after `ready` shows. */
  setup?: (page: Page) => Promise<void>;
  /** Seeded user to sign in as, instead of the audience's default. */
  userId?: string;
  /** Turns Stripe on (`e2e/helpers/stripe.ts`) for this scan. */
  stripe?: boolean;
}

export interface A11ySetupRoute {
  /** The `Setup.currentStep` the wizard is reopened at. */
  step: number;
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
  { path: `/wrapped/share/${A11Y_SHARE_TOKEN}`, as: 'public', ready: 'wrapped-share-heading' },
  { path: '/a11y-missing-page', as: 'public', ready: null },

  // Member
  { path: '/', as: 'member', ready: 'plex-link-card' },
  { path: '/wrapped', as: 'member', ready: 'wrapped-viewer' },
  { path: `/wrapped/${VISUAL_REWIND_YEAR}`, as: 'member', ready: 'wrapped-viewer' },
  { path: '/onboarding', as: 'member', userId: VISUAL_ONBOARDING_USER.id, ready: 'onboarding-welcome-heading' },
  { path: '/discord/link', as: 'member', ready: 'discord-link-panel' },
  { path: '/subscribe', as: 'member', stripe: true, ready: 'subscribe-page' },
  { path: '/subscribe/success', as: 'member', stripe: true, ready: 'subscribe-success-page' },

  // Admin (`/admin` itself redirects to `/admin/users`)
  { path: '/admin/users', as: 'admin', ready: 'admin-users-heading' },
  {
    path: '/admin/users',
    as: 'admin',
    state: 'role filter open',
    ready: 'users-filter-role',
    setup: (page) => openWith(page, 'users-filter-role', 'users-filter-role-option-admin'),
  },
  { path: `/admin/users/${regularId}`, as: 'admin', ready: 'admin-user-season-wrapped-view' },
  { path: `/admin/users/${regularId}/wrapped`, as: 'admin', ready: 'admin-user-wrapped-heading' },
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
    ready: `admin-invites-delete-${VISUAL_INVITE_IDS.valid}`,
    setup: (page) => openWith(page, `admin-invites-delete-${VISUAL_INVITE_IDS.valid}`, 'admin-invites-delete-dialog'),
  },
  { path: `/admin/invites/${VISUAL_INVITE_IDS.valid}`, as: 'admin', ready: 'admin-invite-details-heading' },
  { path: '/admin/announcements', as: 'admin', ready: 'announcements-list' },
  { path: '/admin/cost-analysis', as: 'admin', ready: 'admin-cost-analysis-heading' },
  { path: '/admin/discord', as: 'admin', ready: 'discord-bot-status' },
  { path: '/admin/playground', as: 'admin', ready: 'admin-playground-heading' },
  { path: '/admin/queues', as: 'admin', ready: 'queue-status' },
  { path: '/admin/settings', as: 'admin', ready: 'stripe-settings-card' },
  {
    path: '/admin/settings',
    as: 'admin',
    state: 'Wrapped settings editing',
    ready: 'wrapped-settings-edit-button',
    setup: (page) => openWith(page, 'wrapped-settings-edit-button', 'wrapped-settings-year-note'),
  },
  { path: '/admin/shares', as: 'admin', ready: 'admin-shares-heading' },
  { path: '/admin/llm-usage', as: 'admin', ready: 'admin-llm-usage-heading' },
  { path: '/admin/llm-usage/visual-llm-usage-1', as: 'admin', ready: 'admin-llm-usage-detail-heading' },
  {
    path: `/admin/llm-usage/conversation/${A11Y_CONVERSATION_ID}`,
    as: 'admin',
    ready: 'admin-llm-conversation-heading',
  },
  { path: '/admin/prompts', as: 'admin', ready: 'admin-prompts-heading' },
  { path: '/admin/prompts/new', as: 'admin', ready: 'admin-prompt-new-heading' },
  { path: '/admin/prompts/visual-prompt-active', as: 'admin', ready: 'admin-prompt-detail-heading' },
  { path: '/admin/prompts/visual-prompt-active/edit', as: 'admin', ready: 'admin-prompt-edit-heading' },
  {
    path: `/admin/wrapped/${VISUAL_REWIND_ID}/history/visual-llm-usage-1`,
    as: 'admin',
    ready: 'admin-wrapped-history-heading',
  },
];

/** `/setup` needs an incomplete setup, so these run in the `setup-wizard` project. */
export const A11Y_SETUP_ROUTES: A11ySetupRoute[] = [
  { step: 1, ready: 'setup-form-submit' },
  { step: 3, ready: 'setup-form-submit' },
];

export const ALL_ROUTE_NAMES: string[] = [
  ...A11Y_ROUTES.map(routeName),
  ...A11Y_SETUP_ROUTES.map(setupRouteName),
];
