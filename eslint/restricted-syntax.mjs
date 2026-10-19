import { builtinRules } from "eslint/use-at-your-own-risk";

/**
 * Every `no-restricted-syntax` selector, grouped by the files it covers.
 *
 * In flat config a later block's `no-restricted-syntax` replaces an earlier
 * one for the same file, so steps add selectors to these arrays instead of
 * adding blocks; `eslint.config.mjs` builds one block per entry of
 * `restrictedSyntaxBlocks`. Each selector has a fixture test in
 * `eslint/__tests__/restricted-syntax.test.ts`.
 *
 * One rule has one severity, so warnings run under a second id,
 * `restricted-syntax/warn` (the same core rule, registered by
 * `restrictedSyntaxPlugin`), and errors under `no-restricted-syntax`. A block
 * replaces only the earlier blocks of its own level; the test checks the
 * selectors each kind of file ends up with.
 */

/** Registers the core rule a second time, as `restricted-syntax/warn`. */
export const restrictedSyntaxPlugin = { rules: { warn: builtinRules.get("no-restricted-syntax") } };

/** The rule id a block of `level` sets. */
export const restrictedSyntaxRule = (level) => (level === "error" ? "no-restricted-syntax" : "restricted-syntax/warn");

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
 * Raw form controls outside `components/ui` (P3.4, ui-design-system 9.6):
 * warnings to burn down as P10 moves call sites onto the primitives.
 */
export const rawControls = [
  {
    selector: "JSXOpeningElement[name.name='button']",
    message: "Use Button from components/ui/button instead of a raw <button>.",
  },
  {
    selector: "JSXOpeningElement[name.name='input']",
    message: "Use the components/ui input primitives instead of a raw <input>.",
  },
  {
    selector: "JSXOpeningElement[name.name='select']",
    message: "Use the components/ui select primitive instead of a raw <select>.",
  },
  {
    selector: "JSXOpeningElement[name.name='textarea']",
    message: "Use the components/ui textarea primitive instead of a raw <textarea>.",
  },
];

/** Inline SVG icons outside `components/ui` (P3.4, ui-design-system 3.10). */
export const inlineSvg = [
  {
    selector: "JSXOpeningElement[name.name='svg']",
    message: "Use Icon from components/ui/icon with a lucide-react glyph instead of an inline <svg>.",
  },
];

const APP_AND_COMPONENTS = ["app/**/*.{js,jsx,ts,tsx}", "components/**/*.{js,jsx,ts,tsx}"];
const V2_VIEWER = "components/wrapped/**";

/**
 * The blocks `eslint.config.mjs` builds, in order.
 * - The formatting bans are errors in `app/` and `components/`, except the
 *   v2 viewer, which keeps its output until P7.13; elsewhere they warn.
 * - The raw-element warnings cover `app/` and `components/` outside the
 *   primitives (`components/ui/**`), the dev sheet (`app/dev/**`), Rewind art
 *   (`components/rewind/**`) and the Satori image routes (`app/api/**`). The
 *   v2 viewer warns on raw controls but keeps its inline art until P11.29.
 */
export const restrictedSyntaxBlocks = [
  { files: ["**/*.{js,jsx,ts,tsx}"], ignores: ["app/**", "components/**"], level: "warn", selectors: formatting },
  { files: APP_AND_COMPONENTS, ignores: [V2_VIEWER], level: "error", selectors: formatting },
  { files: ["components/wrapped/**/*.{js,jsx,ts,tsx}"], level: "warn", selectors: [...formatting, ...rawControls] },
  {
    files: APP_AND_COMPONENTS,
    ignores: ["components/ui/**", "components/rewind/**", "app/dev/**", "app/api/**", V2_VIEWER],
    level: "warn",
    selectors: [...rawControls, ...inlineSvg],
  },
];
