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
 * The blocks `eslint.config.mjs` builds, in order. The formatting bans are
 * errors in `app/` and `components/`, except the v2 viewer, which keeps its
 * output until P7.13; elsewhere they warn.
 */
export const restrictedSyntaxBlocks = [
  { files: ["**/*.{js,jsx,ts,tsx}"], level: "warn", selectors: formatting },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: ["components/wrapped/**"],
    level: "error",
    selectors: formatting,
  },
];
