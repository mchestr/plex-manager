/**
 * The token pairs of ui-design-system 9.3 as data, for `scripts/codemods/tokens.ts`
 * (plan step P10.13).
 *
 * Each pair is `{ id, match, replace, mode, note, variant? }`:
 * - `match` is tested against one utility with its variant prefixes and `!`
 *   modifier stripped and its opacity suffix kept (`border-slate-700/50`), so a
 *   pair can keep the opacity through a `$1` capture or drop it;
 * - `replace` is the new utility for an `auto` pair (`''` removes the class; the
 *   variant prefixes and `!` are put back), or the suggestion for a `review` one;
 * - `variant`, when set, limits the pair to classes that carry that variant.
 *
 * The first matching pair wins, so the specific rows come before the catch-all
 * `raw-palette` review row that sends every unmapped palette class to review.
 *
 * Two 9.3 rows read more than one class and live in `tokens.ts` itself:
 * gradient text (`bg-clip-text` with `text-transparent`, auto) and the
 * `uppercase` tracked eyebrow (review). `tokens.ts` also sends `text-white` to
 * review (`on-fill`) when its element is in or on a `<Button>` or a coloured
 * fill a few elements up, which a class string alone can't show. `font-serif` belongs to the Rewind
 * phase and has no row.
 *
 * @module
 */

export type PairMode = 'auto' | 'review'

export interface TokenPair {
  id: string
  match: RegExp
  replace: string
  mode: PairMode
  note: string
  variant?: RegExp
}

const NEUTRAL = '(?:slate|gray|zinc)'
const OPACITY = '(\\/\\d{1,3})?'
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const PREFIXES =
  'bg|text|border|ring|from|via|to|fill|stroke|outline|divide|placeholder|shadow|decoration|caret|accent'

const re = (source: string) => new RegExp(`^${source}$`)

export const TOKEN_PAIRS: readonly TokenPair[] = [
  // UI-27: the base layer draws the focus-visible ring.
  {
    id: 'focus-outline',
    match: /^outline-none$/,
    variant: /^focus$/,
    replace: '',
    mode: 'auto',
    note: 'focus:outline-none goes; the base layer draws the focus-visible ring',
  },
  {
    id: 'focus-ring',
    match: /^ring(?:-.+)?$/,
    variant: /^focus$/,
    replace: '',
    mode: 'auto',
    note: 'focus:ring-* and focus:ring-offset-* go; the base layer draws the focus-visible ring',
  },
  {
    id: 'hover-surface',
    match: re(`bg-${NEUTRAL}-(?:700|800)${OPACITY}`),
    variant: /^(?:group-)?hover$/,
    replace: 'bg-accent',
    mode: 'auto',
    note: 'hover:bg-slate-700/50 and hover:bg-slate-800 become hover:bg-accent',
  },
  {
    id: 'white-wash',
    match: /^bg-white\/(?:5|10)$/,
    replace: 'bg-accent',
    mode: 'auto',
    note: 'bg-white/5 and hover:bg-white/10 become bg-accent',
  },
  {
    id: 'text-foreground',
    match: re(`text-(?:white|${NEUTRAL}-(?:50|100|200))${OPACITY}`),
    replace: 'text-foreground$1',
    mode: 'auto',
    note: 'text-white and text-slate-50/100/200 become text-foreground',
  },
  {
    id: 'text-muted',
    match: re(`text-${NEUTRAL}-(?:400|500|600)${OPACITY}`),
    replace: 'text-muted-foreground$1',
    mode: 'auto',
    note: 'text-slate-400/500/600 become text-muted-foreground',
  },
  {
    id: 'text-secondary',
    match: re(`text-${NEUTRAL}-300${OPACITY}`),
    replace: 'text-foreground (body) or text-muted-foreground (secondary)',
    mode: 'review',
    note: 'text-slate-300 is body or secondary copy, which only the context tells',
  },
  {
    id: 'border',
    match: re(`border(-[trblxyse])?-${NEUTRAL}-(?:700|800)${OPACITY}`),
    replace: 'border$1-border$2',
    mode: 'auto',
    note: 'border-slate-700/800 become border-border',
  },
  {
    id: 'divide',
    match: re(`divide-${NEUTRAL}-(?:700|800)${OPACITY}`),
    replace: 'divide-border$1',
    mode: 'auto',
    note: 'divide-slate-700/800 become divide-border',
  },
  {
    id: 'border-input',
    match: re(`border(-[trblxyse])?-${NEUTRAL}-600${OPACITY}`),
    replace: 'border$1-input$2',
    mode: 'auto',
    note: 'border-slate-600 (inputs) becomes border-input',
  },
  {
    id: 'placeholder',
    match: re(`placeholder-${NEUTRAL}-(?:400|500)`),
    replace: 'placeholder:text-muted-foreground',
    mode: 'auto',
    note: 'placeholder-slate-500 becomes placeholder:text-muted-foreground',
  },
  {
    id: 'status-success',
    match: re(`text-green-400${OPACITY}`),
    replace: 'text-success$1',
    mode: 'auto',
    note: 'status text; use <StatusBadge> where a lib/ui/status domain fits',
  },
  {
    id: 'status-destructive',
    match: re(`text-red-400${OPACITY}`),
    replace: 'text-destructive$1',
    mode: 'auto',
    note: 'status text; use <StatusBadge> where a lib/ui/status domain fits',
  },
  {
    id: 'status-warning',
    match: re(`text-yellow-400${OPACITY}`),
    replace: 'text-warning$1',
    mode: 'auto',
    note: 'status text; use <StatusBadge> where a lib/ui/status domain fits',
  },
  {
    id: 'status-info',
    match: re(`text-blue-400${OPACITY}`),
    replace: 'text-info$1',
    mode: 'auto',
    note: 'status text; use <StatusBadge> where a lib/ui/status domain fits',
  },
  {
    id: 'stat-value',
    match: /^text-(?:purple|violet|indigo|fuchsia|pink)-400$/,
    replace: 'text-foreground',
    mode: 'auto',
    note: 'stat values coloured by position become text-foreground',
  },
  {
    id: 'link-label',
    match: /^text-cyan-(?:300|400|500)(?:\/\d{1,3})?$/,
    replace: 'text-foreground with an underline (links), <Label> (labels) or text-foreground (stat values)',
    mode: 'review',
    note: 'text-cyan-400 marks links, labels and stat values alike',
  },
  {
    id: 'caption',
    match: /^text-\[(?:9|10|11)px\]$/,
    replace: 'text-caption',
    mode: 'auto',
    note: 'text-[9px], text-[10px] and text-[11px] become text-caption (12px)',
  },
  {
    id: 'page-wrapper',
    match: re(`bg-${NEUTRAL}-(?:900|950)${OPACITY}`),
    replace: 'remove the page wrapper: body is bg-background (or <Card> for a panel)',
    mode: 'review',
    note: 'page wrappers repaint the canvas',
  },
  {
    id: 'panel',
    match: re(`bg-${NEUTRAL}-800\\/\\d{1,3}`),
    replace: '<Card> (CardHeader, CardTitle, CardContent)',
    mode: 'review',
    note: 'the hand-copied bg-slate-800/50 panel (DUP-14)',
  },
  {
    id: 'surface-card',
    match: re(`bg-${NEUTRAL}-800`),
    replace: 'bg-card',
    mode: 'review',
    note: 'a solid surface: bg-card, or <Card> for a panel',
  },
  {
    id: 'surface-secondary',
    match: re(`bg-${NEUTRAL}-700${OPACITY}`),
    replace: 'bg-secondary',
    mode: 'review',
    note: 'a raised fill: bg-secondary, or a Button variant',
  },
  {
    id: 'gradient',
    match: /^bg-(?:gradient|linear|radial|conic)-/,
    replace: 'one <Button variant="primary"> per view, or remove the wrapper',
    mode: 'review',
    note: 'gradient fills are banned (gradient text is the auto row)',
  },
  {
    id: 'cta-fill',
    match: /^bg-(?:cyan|purple)-(?:500|600|700)(?:\/\d{1,3})?$/,
    replace: '<Button variant="primary"> (one per view) or variant="secondary"',
    mode: 'review',
    note: 'cyan and purple action fills',
  },
  {
    id: 'z-index',
    match: /^z-\[\d+\]$/,
    replace: 'z-(--z-dropdown), z-(--z-modal) or z-(--z-toast)',
    mode: 'review',
    note: 'arbitrary z-index; z-[200], z-[9999] and z-[10000] map to the --z-* tokens',
  },
  {
    id: 'tracking',
    match: /^tracking-\[/,
    replace: 'remove, or a tracking scale token',
    mode: 'review',
    note: 'arbitrary tracking',
  },
  {
    id: 'arbitrary-color',
    match: /^[a-z-]+-\[(?:#|rgba?\(|hsla?\(|oklch\()/,
    replace: 'bg-primary when it is the action, otherwise tile',
    mode: 'review',
    note: 'brand hex and other arbitrary colours (chart hex goes to lib/charts/theme.ts)',
  },
  {
    id: 'arbitrary-type',
    match: /^text-\[\d+(?:\.\d+)?(?:px|rem)\]$/,
    replace: 'a text-* scale token',
    mode: 'review',
    note: 'arbitrary type size',
  },
  {
    id: 'blur',
    match: /^backdrop-blur(?:-.+)?$/,
    replace: 'remove: cards have no blur',
    mode: 'review',
    note: 'backdrop blur (part of the hand-copied panel)',
  },
  {
    id: 'raw-palette',
    match: new RegExp(`^(?:${PREFIXES})-(?:(?:${PALETTE})-\\d{2,3}|white|black)(?:\\/\\d{1,3})?$`),
    replace: 'a semantic token (no 1:1 pair)',
    mode: 'review',
    note: 'a raw palette class with no 9.3 pair',
  },
]

/** The multi-class rows, here so the counts and the review file can name them. */
export const STRING_RULES = {
  'gradient-text': {
    mode: 'auto',
    replace: 'text-foreground',
    note: 'gradient text becomes text-foreground; keep or add a text-* scale token',
  },
  eyebrow: {
    mode: 'review',
    replace: 'remove the uppercase tracked eyebrow',
    note: 'tracked uppercase eyebrows are banned',
  },
  'on-fill': {
    mode: 'review',
    replace: "the fill's foreground token (text-primary-foreground) or <Button>",
    note: 'text-white inside a Button or on a coloured fill is the fill foreground, not text-foreground',
  },
  'class-map': {
    mode: 'review',
    replace: 'resolve by hand: the keys pair with fills elsewhere',
    note: 'object literals named *Classes, *ClassName or *classes, and cva variant maps, go to review only',
  },
} as const satisfies Record<string, { mode: PairMode; replace: string; note: string }>

/**
 * Paths the codemod never rewrites: the primitives, the v2 Rewind code that
 * P11.29 deletes, the v2 OG image, the admin views P8.8 and P11.29 replace
 * (P10.14's list), and tests.
 */
export const SKIP: readonly RegExp[] = [
  /^components\/ui\//,
  /^components\/wrapped\//,
  /^app\/\(app\)\/wrapped\//,
  /^components\/generator\//,
  /^components\/shared\/formatted-text\.tsx$/,
  /^app\/api\/wrapped\/og-image\//,
  /^components\/admin\/wrapped\//,
  /^app\/admin\/wrapped\//,
  /^app\/admin\/users\/\[userId\]\/wrapped\//,
  /^components\/admin\/playground\//,
  /(?:^|\/)__tests__\//,
  /\.(?:test|spec)\.[cm]?[jt]sx?$/,
  /^e2e\//,
  /^test\//,
]
