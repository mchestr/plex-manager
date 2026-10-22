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
 * Server Actions and route handlers never hand internal error text to the
 * caller (P4.3; SEC-20, BP-04): failures go through `toActionError()` or fixed
 * copy.
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
 * Raw form controls outside `components/ui` (P3.4, ui-design-system 9.6):
 * errors since P10.11 moved every call site onto the primitives.
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

/**
 * The deleted adapters (ui-design-system 9.4; P10.11 removed them): an import
 * of one is an error, so a copy cannot come back under its old name. A
 * `no-restricted-syntax` selector rather than `no-restricted-imports`, so it
 * shares the raw-element block.
 */
export const deprecatedImports = [
  {
    // esquery regexes cannot hold a slash, so `.` stands in for each one.
    selector: "ImportDeclaration[source.value=/^@.components.ui.styled-/]",
    message:
      "StyledInput, StyledTextarea, StyledCheckbox and StyledDropdown are gone: use Input, Textarea, Checkbox or Select from components/ui, with Field or FormField.",
  },
  {
    selector: "ImportDeclaration[source.value=/^@.components.ui.modal-shell$/]",
    message: "ModalShell is gone: use Dialog from components/ui/dialog.",
  },
  {
    selector: "ImportDeclaration[source.value=/^@.components.admin.shared.confirm-modal$/]",
    message: "ConfirmModal is gone: use ConfirmDialog from components/ui/confirm-dialog with useActionDialog.",
  },
];

/**
 * The Rewind-only Button entries (P3.7, ui-design-system 4.4 and 9.6): the
 * `ink` and `ink-outline` variants and the `pill` and `icon-pill` sizes print
 * in a page's ink, so they are errors outside `components/rewind/**`, the
 * primitives (`components/ui/**`) and the dev sheet (`app/dev/**`).
 */
export const rewindOnlyProps = [
  {
    selector: "JSXAttribute[name.name='variant'][value.value=/^ink(-outline)?$/]",
    message: "The ink and ink-outline Button variants are for the Rewind scope only (components/rewind).",
  },
  {
    selector: "JSXAttribute[name.name='variant'] > JSXExpressionContainer > Literal[value=/^ink(-outline)?$/]",
    message: "The ink and ink-outline Button variants are for the Rewind scope only (components/rewind).",
  },
  {
    selector: "JSXAttribute[name.name='size'][value.value=/^(icon-)?pill$/]",
    message: "The pill and icon-pill Button sizes are for the Rewind scope only (components/rewind).",
  },
  {
    selector: "JSXAttribute[name.name='size'] > JSXExpressionContainer > Literal[value=/^(icon-)?pill$/]",
    message: "The pill and icon-pill Button sizes are for the Rewind scope only (components/rewind).",
  },
];

/**
 * What Satori cannot draw, or draws slowly, in the share cards (P5.10,
 * design 6.4): grid, shadows, filters, blend modes, clip paths, text stroke,
 * CSS variables, `calc()` and SVG `<text>`. Errors in `lib/rewind/cards/**`;
 * the tree test there checks `display: 'flex'` on every element with
 * children.
 */
const satoriBan = (name, why) => ({
  selector: `Property[key.name='${name}']`,
  message: `Satori cards cannot use ${name} (${why}).`,
});

export const rewindCards = [
  {
    selector: "Property[key.name='display'][value.value='grid']",
    message: "Satori cards cannot use display: 'grid': lay out with flex.",
  },
  satoriBan("boxShadow", "about 6 s of an 8 s render in resvg"),
  satoriBan("filter", "unsupported"),
  satoriBan("backdropFilter", "unsupported"),
  satoriBan("mixBlendMode", "unsupported"),
  satoriBan("clipPath", "unsupported"),
  satoriBan("WebkitTextStroke", "unsupported"),
  {
    selector: "Literal[value=/var\\(--|calc\\(/]",
    message: "Satori cards cannot use CSS variables or calc(): compute the value in TypeScript.",
  },
  {
    selector: "TemplateElement[value.raw=/var\\(--|calc\\(/]",
    message: "Satori cards cannot use CSS variables or calc(): compute the value in TypeScript.",
  },
  {
    selector: "JSXOpeningElement[name.name='text']",
    message: "No SVG <text> in a card: set labels as HTML positioned from the graphic's anchors.",
  },
];

/** Where the Rewind-only Button entries may appear. */
const REWIND_ONLY_ALLOWED = ["components/ui/**", "components/rewind/**", "app/dev/**"];

const APP_AND_COMPONENTS = ["app/**/*.{js,jsx,ts,tsx}", "components/**/*.{js,jsx,ts,tsx}"];
/** The pre-refresh setup wizard; P10.25 rebuilds it on the primitives. */
const SETUP_WIZARD = "components/setup/setup-wizard/**";
/** The `next/og` image routes, which draw with Satori rather than the DOM. */
const OG_ROUTES = ["app/icon.tsx", "app/apple-icon.tsx", "app/opengraph-image.tsx", "app/twitter-image.tsx"];
/**
 * Where raw elements and inline SVG are allowed: the primitives, Rewind art,
 * the dev sheet and the image routes (P10.11, ui-design-system 9.6).
 */
const RAW_ELEMENTS_ALLOWED = [...REWIND_ONLY_ALLOWED, "app/api/**", ...OG_ROUTES];

/**
 * The blocks `eslint.config.mjs` builds, in order.
 * - The formatting bans are errors in `app/` and `components/`; elsewhere
 *   they warn.
 * - The raw-element bans and the deleted-adapter imports are errors in
 *   `app/` and `components/` outside `RAW_ELEMENTS_ALLOWED` (P10.11). The
 *   setup wizard still warns until P10.25 rebuilds it.
 * - The `actionsAndApi` bans are errors in `app/api/` and all of `actions/`
 *   since P11.5 moved the last modules onto the action helper. An error block
 *   replaces the earlier error blocks for its files, so it repeats the
 *   formatting bans, which are errors there too.
 * - The Rewind-only Button entries (P3.7) are errors everywhere but
 *   `REWIND_ONLY_ALLOWED`, so every error block outside it carries them.
 * - The Satori bans (`rewindCards`, P5.10) are errors in `lib/rewind/cards/`.
 */
export const restrictedSyntaxBlocks = [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ignores: ["app/**", "components/**", "actions/**"],
    level: "warn",
    selectors: formatting,
  },
  {
    files: ["**/*.{jsx,tsx}"],
    ignores: ["app/**", "components/**"],
    level: "error",
    selectors: rewindOnlyProps,
  },
  {
    files: APP_AND_COMPONENTS,
    ignores: [SETUP_WIZARD, ...RAW_ELEMENTS_ALLOWED],
    level: "error",
    selectors: [...formatting, ...rewindOnlyProps, ...rawControls, ...inlineSvg, ...deprecatedImports],
  },
  { files: REWIND_ONLY_ALLOWED.map((glob) => glob + "/*.{js,jsx,ts,tsx}"), level: "error", selectors: formatting },
  { files: OG_ROUTES, level: "error", selectors: [...formatting, ...rewindOnlyProps] },
  { files: [SETUP_WIZARD + "/*.{js,jsx,ts,tsx}"], level: "error", selectors: [...formatting, ...rewindOnlyProps] },
  {
    files: [SETUP_WIZARD + "/*.{js,jsx,ts,tsx}"],
    level: "warn",
    selectors: [...rawControls, ...inlineSvg, ...deprecatedImports],
  },
  {
    files: ["app/api/**/*.{ts,tsx}", "actions/**/*.ts"],
    level: "error",
    selectors: [...formatting, ...actionsAndApi, ...rewindOnlyProps],
  },
  { files: ["lib/rewind/cards/**/*.{ts,tsx}"], level: "error", selectors: [...rewindOnlyProps, ...rewindCards] },
];
