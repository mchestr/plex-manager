/**
 * Every `no-restricted-syntax` selector, grouped by the files it covers.
 *
 * In flat config a later block's `no-restricted-syntax` replaces an earlier
 * one for the same file, so steps add selectors to these arrays instead of
 * adding blocks; `eslint.config.mjs` builds one block per entry of
 * `restrictedSyntaxBlocks`. Each selector has a fixture test in
 * `eslint/__tests__/restricted-syntax.test.ts`.
 */

/** Formatting goes through `lib/utils/format.ts` (P3.10; GAP-41, GAP-46, UI-28). */
export const formatting = [
  {
    selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
    message:
      "Format with lib/utils/format.ts (getFormat() on the server, useFormat() or <Time> on the client) so the server zone and locale apply.",
  },
  {
    selector:
      "TemplateLiteral:has(> TemplateElement[value.raw=/\\$$/]) > CallExpression[callee.property.name='toFixed']",
    message: "Format money with formatMoney() from lib/utils/format.ts.",
  },
  {
    selector: "JSXText[value=/\\$\\s*$/] + JSXExpressionContainer CallExpression[callee.property.name='toFixed']",
    message: "Format money with formatMoney() from lib/utils/format.ts.",
  },
];

/**
 * Server Actions and route handlers never hand internal error text to the
 * caller (P4.3; SEC-20, BP-04): failures go through `toActionError()` or fixed
 * copy. P3.4 adds its raw-element bans to this array.
 */
export const actionsAndApi = [
  {
    selector:
      "ConditionalExpression[test.operator='instanceof'][test.right.name='Error'][consequent.type='MemberExpression'][consequent.property.name='message']",
    message:
      "Never return or forward error.message: return toActionError(error, fallback) or fixed copy, and log the error itself.",
  },
];

/**
 * The Server Action modules on `lib/actions/define-action.ts` (P4.3), where
 * the `actionsAndApi` bans are errors. P11.5 moves the admin modules and then
 * makes the bans errors in all of `actions/`.
 */
export const migratedActionFiles = [
  "actions/announcements.ts",
  "actions/auth.ts",
  "actions/invite.ts",
  "actions/onboarding.ts",
  "actions/prometheus-status.ts",
  "actions/prompt-test.ts",
  "actions/rewind-generation.ts",
  "actions/server-info.ts",
  "actions/subscription.ts",
  "actions/watchlist.ts",
  "actions/wrapped-share-link.ts",
];

/**
 * The blocks `eslint.config.mjs` builds, in order. The formatting bans are
 * errors in `app/` and `components/`, except the v2 viewer, which keeps its
 * output until P7.13; elsewhere they warn. The `actionsAndApi` bans are
 * errors in `app/api/` and the migrated action modules, and warn in the rest
 * of `actions/`. A later block replaces an earlier one's selectors for the
 * same file, so each block repeats the formatting bans at its own level.
 */
export const restrictedSyntaxBlocks = [
  { files: ["**/*.{js,jsx,ts,tsx}"], level: "warn", selectors: formatting },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: ["components/wrapped/**"],
    level: "error",
    selectors: formatting,
  },
  { files: ["actions/**/*.ts"], level: "warn", selectors: [...formatting, ...actionsAndApi] },
  { files: ["app/api/**/*.{ts,tsx}", ...migratedActionFiles], level: "error", selectors: [...formatting, ...actionsAndApi] },
];
