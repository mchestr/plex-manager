/**
 * The story's keyboard map (Rewind design 4.6, WCAG 2.1.4). The stage calls
 * it from `onKeyDown` on its own region, so keys work only while focus is in
 * the story.
 *
 * The arrows, PageUp, PageDown, Space, Home, End and Esc always work, and
 * Enter chooses the full issue on the cover (design 4.3). The
 * letter keys (K, S, T and comma) work only while the Keyboard shortcuts
 * preference is on. Nothing fires from a text field or from inside a sheet,
 * modified keys are left to the browser, Space on a button or link is left to
 * that control, and inside `[data-rw-interactive]` (quiz, scrubber) only Esc
 * is taken. Inside a composite widget (a slider, a grid, a radio group or a
 * tab list; {@link isCompositeWidgetTarget}) the arrows, Home, End and the Page
 * keys belong to the widget and Esc still closes. Inside `[data-rw-scroll]` (the desktop spread's rail and Notes,
 * P7.4) the arrows, Page keys, Home, End and Space are left to scroll it.
 *
 * @module lib/rewind/stage/keymap
 */

export type StageCommand = "next" | "prev" | "first" | "last" | "toggle-play" | "escape" | "share" | "table" | "settings" | "choose"

export interface KeyInput {
  key: string
  target: EventTarget | null
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

const ALWAYS: Record<string, StageCommand> = {
  ArrowRight: "next",
  PageDown: "next",
  ArrowLeft: "prev",
  PageUp: "prev",
  Home: "first",
  End: "last",
  " ": "toggle-play",
  Escape: "escape",
  Enter: "choose",
}

const LETTERS: Record<string, StageCommand> = { k: "toggle-play", s: "share", t: "table", ",": "settings" }

/** Keys a scrolling column keeps for itself. */
const SCROLL_KEYS = new Set(["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "PageDown", "PageUp", "Home", "End", " "])

const TEXT_FIELD = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
const CONTROL = 'button, a[href], [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="link"]'

/** Keys a composite widget (the race scrubber, the calendar grid, a month selector) moves itself with. */
const WIDGET_KEYS = new Set(["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "PageDown", "PageUp", "Home", "End"])

const COMPOSITE_WIDGET = '[role="slider"], [role="grid"], [role="radiogroup"], [role="tablist"]'

function closest(target: EventTarget | null, selector: string): boolean {
  return typeof Element !== "undefined" && target instanceof Element && target.closest(selector) !== null
}

/**
 * Whether `target` sits inside a slider, a grid, a radio group or a tab list, whose arrow keys are its own (P8.3).
 *
 * @internal `keyToCommand` uses it; the tests check it directly.
 */
export function isCompositeWidgetTarget(target: EventTarget | null): boolean {
  return closest(target, COMPOSITE_WIDGET)
}

export function keyToCommand(event: KeyInput, { shortcuts }: { shortcuts: boolean }): StageCommand | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null
  if (closest(event.target, TEXT_FIELD) || closest(event.target, '[role="dialog"], [role="alertdialog"]')) return null

  const command = ALWAYS[event.key] ?? (shortcuts ? LETTERS[event.key.toLowerCase()] : undefined) ?? null
  if (command === null || command === "escape") return command
  if (closest(event.target, "[data-rw-interactive]")) return null
  if (WIDGET_KEYS.has(event.key) && isCompositeWidgetTarget(event.target)) return null
  if (SCROLL_KEYS.has(event.key) && closest(event.target, "[data-rw-scroll]")) return null
  if ((event.key === " " || event.key === "Enter") && closest(event.target, CONTROL)) return null
  return command
}
