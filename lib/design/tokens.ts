/**
 * The TypeScript mirror of the colour tokens in `app/globals.css`
 * (ui-design-system 4.3), for the places that cannot read CSS variables,
 * `oklch()` or `color-mix()`: Satori share and OG cards, and Rewind.
 *
 * ## Overview
 *
 * - `themes` holds every app colour token of the dark (default) and light
 *   themes (ui-design-system 3.2 and 3.3), as the CSS `oklch()` string and its
 *   sRGB hex. A translucent token's hex carries its alpha (`#rrggbbaa`).
 * - `subtleAlpha` is the strength of the `-subtle` status tints, which the CSS
 *   writes as `color-mix(in oklab, var(--tone) N%, transparent)`.
 * - `rewindInks` holds the twelve Rewind inks (Rewind 5.2): the field, the ink
 *   printed on it, the deep ink (that hue as ink on paper), the spot colour and
 *   the colour scheme.
 * - `rewindRemap` is what each app token becomes inside the Rewind scope (the
 *   `[data-field]` rule of 4.4), so no graphite value leaks into a page.
 * - `archetypeInks` is each archetype's colourway (Rewind 5.3). The back cover
 *   prints in `rewindInks[deep].deep`.
 * - `inkProps()` gives an element the attributes that print it in an ink.
 *
 * `lib/design/__tests__/tokens.test.ts` parses the CSS and fails when the two
 * disagree, and measures every text and mark pair against WCAG.
 *
 * @example
 * ```ts
 * themes.dark.background.hex // '#1a1c1e'
 * rewindInks.marigold.on.hex // '#1f1306'
 * inkProps('ultramarine', { spot: 'arch' })
 * // { 'data-field': 'ultramarine', className: 'dark', 'data-spot': 'arch' }
 * ```
 *
 * @module lib/design/tokens
 */

import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

type StatusTone = "destructive" | "success" | "warning" | "info"

/** Every app colour token (ui-design-system 3.2, with the extras, `sidebar-*` and `overlay`). */
export type TokenName =
  | "background" | "foreground" | "card" | "card-foreground" | "popover" | "popover-foreground"
  | "primary" | "primary-hover" | "primary-foreground" | "primary-indicator" | "primary-indicator-foreground"
  | "secondary" | "secondary-hover" | "secondary-foreground" | "muted" | "muted-foreground"
  | "accent" | "accent-foreground"
  | StatusTone | `${StatusTone}-foreground`
  | "border" | "border-strong" | "input" | "ring"
  | "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5"
  | "sidebar" | "sidebar-foreground" | "sidebar-primary" | "sidebar-primary-foreground"
  | "sidebar-accent" | "sidebar-accent-foreground" | "sidebar-border" | "sidebar-ring"
  | "overlay"

export interface TokenValue {
  oklch: string
  hex: `#${string}`
}

export type ThemeName = "dark" | "light"

export const themes = {
  dark: {
    background: { oklch: "oklch(22.5% 0.005 255)", hex: "#1a1c1e" },
    foreground: { oklch: "oklch(96.5% 0.003 255)", hex: "#f2f3f5" },
    card: { oklch: "oklch(25.2% 0.005 255)", hex: "#202224" },
    "card-foreground": { oklch: "oklch(96.5% 0.003 255)", hex: "#f2f3f5" },
    popover: { oklch: "oklch(28% 0.006 255)", hex: "#27292c" },
    "popover-foreground": { oklch: "oklch(96.5% 0.003 255)", hex: "#f2f3f5" },
    primary: { oklch: "oklch(79% 0.155 75)", hex: "#f4aa2c" },
    "primary-hover": { oklch: "oklch(83% 0.145 77)", hex: "#fcba4b" },
    "primary-foreground": { oklch: "oklch(20% 0.03 65)", hex: "#1f1307" },
    "primary-indicator": { oklch: "oklch(79% 0.155 75)", hex: "#f4aa2c" },
    "primary-indicator-foreground": { oklch: "oklch(20% 0.03 65)", hex: "#1f1307" },
    secondary: { oklch: "oklch(30.5% 0.006 255)", hex: "#2d2f32" },
    "secondary-hover": { oklch: "oklch(34% 0.006 255)", hex: "#36383b" },
    "secondary-foreground": { oklch: "oklch(96.5% 0.003 255)", hex: "#f2f3f5" },
    muted: { oklch: "oklch(27.5% 0.005 255)", hex: "#26282a" },
    "muted-foreground": { oklch: "oklch(76% 0.01 255)", hex: "#adb1b7" },
    accent: { oklch: "oklch(31.5% 0.006 255)", hex: "#303235" },
    "accent-foreground": { oklch: "oklch(96.5% 0.003 255)", hex: "#f2f3f5" },
    destructive: { oklch: "oklch(74% 0.15 25)", hex: "#fb817a" },
    "destructive-foreground": { oklch: "oklch(20% 0.04 25)", hex: "#250e0d" },
    success: { oklch: "oklch(77% 0.15 155)", hex: "#56d089" },
    "success-foreground": { oklch: "oklch(20% 0.04 155)", hex: "#051b0e" },
    warning: { oklch: "oklch(88% 0.13 102)", hex: "#e9db6f" },
    "warning-foreground": { oklch: "oklch(22% 0.04 95)", hex: "#201a03" },
    info: { oklch: "oklch(77% 0.11 240)", hex: "#6ebdf3" },
    "info-foreground": { oklch: "oklch(20% 0.04 240)", hex: "#031826" },
    border: { oklch: "oklch(35% 0.006 255)", hex: "#383b3e" },
    "border-strong": { oklch: "oklch(44% 0.006 255)", hex: "#505356" },
    input: { oklch: "oklch(56% 0.008 255)", hex: "#717579" },
    ring: { oklch: "oklch(79% 0.155 75)", hex: "#f4aa2c" },
    "chart-1": { oklch: "oklch(67% 0.14 70)", hex: "#cb8315" },
    "chart-2": { oklch: "oklch(62% 0.14 250)", hex: "#398ad6" },
    "chart-3": { oklch: "oklch(66% 0.12 175)", hex: "#19aa8e" },
    "chart-4": { oklch: "oklch(60% 0.16 305)", hex: "#9763cc" },
    "chart-5": { oklch: "oklch(66% 0.17 355)", hex: "#df5e97" },
    sidebar: { oklch: "oklch(20.5% 0.005 255)", hex: "#161719" },
    "sidebar-foreground": { oklch: "oklch(82% 0.006 255)", hex: "#c1c4c8" },
    "sidebar-primary": { oklch: "oklch(79% 0.155 75)", hex: "#f4aa2c" },
    "sidebar-primary-foreground": { oklch: "oklch(20% 0.03 65)", hex: "#1f1307" },
    "sidebar-accent": { oklch: "oklch(27.5% 0.006 255)", hex: "#26282b" },
    "sidebar-accent-foreground": { oklch: "oklch(96.5% 0.003 255)", hex: "#f2f3f5" },
    "sidebar-border": { oklch: "oklch(30% 0.006 255)", hex: "#2c2e31" },
    "sidebar-ring": { oklch: "oklch(79% 0.155 75)", hex: "#f4aa2c" },
    overlay: { oklch: "oklch(14% 0.005 255 / 0.72)", hex: "#08090bb8" },
  },
  light: {
    background: { oklch: "oklch(98.5% 0.002 255)", hex: "#f9fafb" },
    foreground: { oklch: "oklch(20% 0.006 255)", hex: "#141619" },
    card: { oklch: "oklch(100% 0 0)", hex: "#ffffff" },
    "card-foreground": { oklch: "oklch(20% 0.006 255)", hex: "#141619" },
    popover: { oklch: "oklch(100% 0 0)", hex: "#ffffff" },
    "popover-foreground": { oklch: "oklch(20% 0.006 255)", hex: "#141619" },
    primary: { oklch: "oklch(79% 0.155 75)", hex: "#f4aa2c" },
    "primary-hover": { oklch: "oklch(75% 0.155 72)", hex: "#e99b1a" },
    "primary-foreground": { oklch: "oklch(20% 0.03 65)", hex: "#1f1307" },
    "primary-indicator": { oklch: "oklch(55% 0.12 62)", hex: "#a25f12" },
    "primary-indicator-foreground": { oklch: "oklch(98.5% 0 0)", hex: "#fafafa" },
    secondary: { oklch: "oklch(95.5% 0.003 255)", hex: "#eff0f2" },
    "secondary-hover": { oklch: "oklch(92.5% 0.004 255)", hex: "#e4e6e9" },
    "secondary-foreground": { oklch: "oklch(20% 0.006 255)", hex: "#141619" },
    muted: { oklch: "oklch(96.5% 0.003 255)", hex: "#f2f3f5" },
    "muted-foreground": { oklch: "oklch(47% 0.012 255)", hex: "#565b62" },
    accent: { oklch: "oklch(94.5% 0.004 255)", hex: "#ebedef" },
    "accent-foreground": { oklch: "oklch(20% 0.006 255)", hex: "#141619" },
    destructive: { oklch: "oklch(49% 0.19 27)", hex: "#b31319" },
    "destructive-foreground": { oklch: "oklch(98.5% 0 0)", hex: "#fafafa" },
    success: { oklch: "oklch(46% 0.12 155)", hex: "#006b39" },
    "success-foreground": { oklch: "oklch(98.5% 0 0)", hex: "#fafafa" },
    warning: { oklch: "oklch(47% 0.1 85)", hex: "#745500" },
    "warning-foreground": { oklch: "oklch(98.5% 0 0)", hex: "#fafafa" },
    info: { oklch: "oklch(47% 0.13 250)", hex: "#065da0" },
    "info-foreground": { oklch: "oklch(98.5% 0 0)", hex: "#fafafa" },
    border: { oklch: "oklch(90% 0.004 255)", hex: "#dcdee1" },
    "border-strong": { oklch: "oklch(84% 0.005 255)", hex: "#c8cbce" },
    input: { oklch: "oklch(62% 0.008 255)", hex: "#83868b" },
    ring: { oklch: "oklch(55% 0.12 62)", hex: "#a25f12" },
    "chart-1": { oklch: "oklch(64% 0.135 62)", hex: "#c57722" },
    "chart-2": { oklch: "oklch(55% 0.15 250)", hex: "#0f74c5" },
    "chart-3": { oklch: "oklch(60% 0.11 175)", hex: "#11957c" },
    "chart-4": { oklch: "oklch(55% 0.18 305)", hex: "#8b4ec4" },
    "chart-5": { oklch: "oklch(60% 0.19 355)", hex: "#d14186" },
    sidebar: { oklch: "oklch(97% 0.003 255)", hex: "#f4f5f7" },
    "sidebar-foreground": { oklch: "oklch(35% 0.008 255)", hex: "#383b3f" },
    "sidebar-primary": { oklch: "oklch(55% 0.12 62)", hex: "#a25f12" },
    "sidebar-primary-foreground": { oklch: "oklch(98.5% 0 0)", hex: "#fafafa" },
    "sidebar-accent": { oklch: "oklch(93% 0.004 255)", hex: "#e6e8ea" },
    "sidebar-accent-foreground": { oklch: "oklch(20% 0.006 255)", hex: "#141619" },
    "sidebar-border": { oklch: "oklch(90% 0.004 255)", hex: "#dcdee1" },
    "sidebar-ring": { oklch: "oklch(55% 0.12 62)", hex: "#a25f12" },
    overlay: { oklch: "oklch(20% 0.006 255 / 0.4)", hex: "#14161966" },
  },
} as const satisfies Record<ThemeName, Record<TokenName, TokenValue>>

/** The `-subtle` status tints: the tone at this alpha over the surface (14% dark, 10% light). @internal */
export const subtleAlpha = { dark: 0.14, light: 0.1 } as const satisfies Record<ThemeName, number>

/** The twelve Rewind inks (Rewind 5.2). */
export type InkName =
  | "paper" | "coral" | "marigold" | "rose" | "sky" | "peach" | "lilac" | "mint"
  | "ultramarine" | "forest" | "oxblood" | "petrol"

export interface RewindInk {
  /** The page colour. */
  field: TokenValue
  /** Text and marks on the field. */
  on: TokenValue
  /** The same hue as ink on paper, and the back cover's ink. */
  deep: TokenValue
  /** The one other colour on the page: the ink itself, another ink's field, or (paper) the archetype's deep ink. */
  spot: InkName | "on" | "arch-deep"
  scheme: "light" | "dark"
}

export const rewindInks = {
  paper: {
    field: { oklch: "oklch(94% 0.02 85)", hex: "#f1eadc" },
    on: { oklch: "oklch(19% 0.012 70)", hex: "#17130e" },
    deep: { oklch: "oklch(19% 0.012 70)", hex: "#17130e" },
    spot: "arch-deep",
    scheme: "light",
  },
  coral: {
    field: { oklch: "oklch(71.5% 0.16 34)", hex: "#f6795c" },
    on: { oklch: "oklch(18% 0.035 30)", hex: "#1f0b08" },
    deep: { oklch: "oklch(43% 0.15 30)", hex: "#902014" },
    spot: "on",
    scheme: "light",
  },
  marigold: {
    field: { oklch: "oklch(82.5% 0.15 75)", hex: "#feb644" },
    on: { oklch: "oklch(20% 0.03 70)", hex: "#1f1306" },
    deep: { oklch: "oklch(41.5% 0.085 65)", hex: "#6b410e" },
    spot: "on",
    scheme: "light",
  },
  rose: {
    field: { oklch: "oklch(79% 0.12 352)", hex: "#f69ac3" },
    on: { oklch: "oklch(20% 0.04 345)", hex: "#230e1a" },
    deep: { oklch: "oklch(42% 0.15 355)", hex: "#861a51" },
    spot: "on",
    scheme: "light",
  },
  sky: {
    field: { oklch: "oklch(84% 0.075 235)", hex: "#9ad3f5" },
    on: { oklch: "oklch(22% 0.05 245)", hex: "#031c30" },
    deep: { oklch: "oklch(41% 0.1 245)", hex: "#064e7c" },
    spot: "on",
    scheme: "light",
  },
  peach: {
    field: { oklch: "oklch(84.5% 0.075 45)", hex: "#f7bda4" },
    on: { oklch: "oklch(21% 0.035 40)", hex: "#26120c" },
    deep: { oklch: "oklch(42% 0.11 40)", hex: "#7d3317" },
    spot: "on",
    scheme: "light",
  },
  lilac: {
    field: { oklch: "oklch(78% 0.095 290)", hex: "#b6adf0" },
    on: { oklch: "oklch(20% 0.06 285)", hex: "#141030" },
    deep: { oklch: "oklch(42% 0.15 290)", hex: "#4f3797" },
    spot: "on",
    scheme: "light",
  },
  mint: {
    field: { oklch: "oklch(86% 0.085 165)", hex: "#9be3c3" },
    on: { oklch: "oklch(20% 0.03 165)", hex: "#071a13" },
    deep: { oklch: "oklch(40% 0.08 160)", hex: "#145538" },
    spot: "on",
    scheme: "light",
  },
  ultramarine: {
    field: { oklch: "oklch(42% 0.2 268)", hex: "#2238b8" },
    on: { oklch: "oklch(94% 0.02 85)", hex: "#f1eadc" },
    deep: { oklch: "oklch(42% 0.2 268)", hex: "#2238b8" },
    spot: "marigold",
    scheme: "dark",
  },
  forest: {
    field: { oklch: "oklch(40% 0.075 165)", hex: "#13543d" },
    on: { oklch: "oklch(94% 0.02 85)", hex: "#f1eadc" },
    deep: { oklch: "oklch(40% 0.075 165)", hex: "#13543d" },
    spot: "on",
    scheme: "dark",
  },
  oxblood: {
    field: { oklch: "oklch(33% 0.1 18)", hex: "#5e1921" },
    on: { oklch: "oklch(93% 0.03 60)", hex: "#f8e4d4" },
    deep: { oklch: "oklch(33% 0.1 18)", hex: "#5e1921" },
    spot: "on",
    scheme: "dark",
  },
  petrol: {
    field: { oklch: "oklch(40.5% 0.065 215)", hex: "#11525f" },
    on: { oklch: "oklch(94% 0.02 85)", hex: "#f1eadc" },
    deep: { oklch: "oklch(40.5% 0.065 215)", hex: "#11525f" },
    spot: "on",
    scheme: "dark",
  },
} as const satisfies Record<InkName, RewindInk>

/** What an app token reads inside the scope: a colour of the page's ink, paper (popups), transparent, or a fixed value. @internal */
export type RemapValue = "field" | "ink" | "spot" | "paper" | "on-paper" | "transparent" | TokenValue

/**
 * The scope's semantic remap (ui-design-system 4.4). `sidebar-*` never renders inside Rewind.
 * The token sync test checks it against `globals.css`.
 *
 * @internal
 */
export const rewindRemap = {
  background: "field", foreground: "ink",
  card: "field", "card-foreground": "ink",
  popover: "paper", "popover-foreground": "on-paper",
  primary: "ink", "primary-foreground": "field", "primary-hover": "ink",
  "primary-indicator": "ink", "primary-indicator-foreground": "field",
  secondary: "transparent", "secondary-foreground": "ink", "secondary-hover": "ink",
  muted: "transparent", "muted-foreground": "ink",
  accent: "ink", "accent-foreground": "field",
  destructive: "ink", "destructive-foreground": "field", "destructive-subtle": "transparent",
  success: "ink", "success-foreground": "field", "success-subtle": "transparent",
  warning: "ink", "warning-foreground": "field", "warning-subtle": "transparent",
  info: "ink", "info-foreground": "field", "info-subtle": "transparent",
  border: "ink", "border-strong": "ink", input: "ink", ring: "ink",
  "chart-1": "ink", "chart-2": "spot", "chart-3": "ink", "chart-4": "ink", "chart-5": "ink",
  overlay: { oklch: "oklch(19% 0.012 70 / 0.55)", hex: "#17130e8c" },
} as const satisfies Record<Exclude<TokenName, "sidebar" | `sidebar-${string}`> | `${StatusTone}-subtle`, RemapValue>

/** @public P5 prints the cover and back cover from it. */
export interface ArchetypeInks {
  field: InkName
  /** `own`: the archetype prints in two inks (hatch and solid), so its spot is the field's own ink. */
  spot: InkName | "own"
  /** The back cover prints in `rewindInks[deep].deep`. */
  deep: InkName
}

/** Each archetype's colourway (Rewind 5.3). @public P5 prints the cover and back cover from it. */
export const archetypeInks = {
  "midnight-marathoner": { field: "ultramarine", spot: "marigold", deep: "ultramarine" },
  "credits-roller": { field: "forest", spot: "mint", deep: "forest" },
  "comfort-rewatcher": { field: "peach", spot: "oxblood", deep: "peach" },
  "premiere-chaser": { field: "coral", spot: "own", deep: "coral" },
  "series-devourer": { field: "mint", spot: "ultramarine", deep: "mint" },
  "weekend-double-feature": { field: "rose", spot: "ultramarine", deep: "rose" },
  curator: { field: "paper", spot: "ultramarine", deep: "ultramarine" },
  explorer: { field: "petrol", spot: "marigold", deep: "petrol" },
  loyalist: { field: "oxblood", spot: "peach", deep: "oxblood" },
  "golden-hour-viewer": { field: "marigold", spot: "oxblood", deep: "marigold" },
  "festival-juror": { field: "lilac", spot: "forest", deep: "lilac" },
  "casual-critic": { field: "sky", spot: "ultramarine", deep: "sky" },
} as const satisfies Record<ArchetypeId, ArchetypeInks>

/** @public P5.1 sets the Rewind scope with `inkProps`. */
export interface InkPropsOptions {
  /** The cover and centrefold: the spot is the archetype's spot. */
  spot?: "arch"
  /** The back cover (on paper): the ink is the archetype's deep ink. */
  ink?: "arch-deep"
}

/** @public */
export interface InkProps {
  "data-field": InkName
  "data-spot"?: "arch"
  "data-ink"?: "arch-deep"
  className: "light" | "dark"
}

/** Props for an element that prints in an ink: `<section {...inkProps('coral')}>`. @public P5.1 is its first caller. */
export function inkProps(ink: InkName, opts: InkPropsOptions = {}): InkProps {
  return {
    "data-field": ink,
    className: rewindInks[ink].scheme,
    ...(opts.spot ? { "data-spot": opts.spot } : {}),
    ...(opts.ink ? { "data-ink": opts.ink } : {}),
  }
}

/** The app radius scale in px (the Rewind scope is 2px smaller at every step). @public P5.10's card routes read it. */
export const radius = { sm: 4, md: 6, lg: 8, xl: 12 } as const

/** @public P5.10's card routes read it. */
export const fonts = { sans: "IBM Plex Sans", mono: "IBM Plex Mono" } as const
