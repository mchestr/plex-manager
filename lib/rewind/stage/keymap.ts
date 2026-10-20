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
 * is taken.
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

const TEXT_FIELD = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
const CONTROL = 'button, a[href], [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="link"]'

function closest(target: EventTarget | null, selector: string): boolean {
  return typeof Element !== "undefined" && target instanceof Element && target.closest(selector) !== null
}

export function keyToCommand(event: KeyInput, { shortcuts }: { shortcuts: boolean }): StageCommand | null {
  if (event.altKey || event.ctrlKey || event.metaKey) return null
  if (closest(event.target, TEXT_FIELD) || closest(event.target, '[role="dialog"], [role="alertdialog"]')) return null

  const command = ALWAYS[event.key] ?? (shortcuts ? LETTERS[event.key.toLowerCase()] : undefined) ?? null
  if (command === null || command === "escape") return command
  if (closest(event.target, "[data-rw-interactive]")) return null
  if ((event.key === " " || event.key === "Enter") && closest(event.target, CONTROL)) return null
  return command
}
