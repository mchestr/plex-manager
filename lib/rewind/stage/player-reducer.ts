/**
 * The story player's state machine (Rewind design 4.6 and 14.3).
 *
 * ```
 *  cover ──choose a cut──▶ playing ◀──Play── paused
 *    │                      │  ▲  ╲──Pause, hidden tab, focus on a control──▶
 *    │                      │  └── release ── holding ◀── press 250 ms
 *    │                      ├──── quiz, scrubber ──▶ interacting ── answer ──▶ (back)
 *    └── Settings ──▶ sheet ◀── Settings, Share, Table (from any mode)
 *                       └── close: back to the mode it was opened from
 *  back cover reached ──▶ ended ── Read again ──▶ page 02
 * ```
 *
 * `holding`, `interacting` and `sheet` are temporary: `resumeTo` holds the
 * mode they return to, so closing a sheet resumes only if the story was
 * playing. A `paused` state with `resumeTo: 'playing'` was paused by focus on
 * a control, and `BLUR_CONTROL` resumes it; a member's Pause clears it.
 *
 * A cut (P7.3) swaps the page list while the story sits on the cover:
 * `SET_KINDS` replaces the kinds there and nowhere else, and `CHOOSE_CUT`
 * names the cut the stage swapped to. A one-page issue whose page is an end
 * page (the postcard) opens `ended`.
 *
 * Member turns (`source` other than auto) keep autoplay on; automatic turns
 * come only from `DWELL_END` and record `lastTurn: 'auto'`, which P5.3 uses to
 * decide between moving focus and announcing the page.
 *
 * @module lib/rewind/stage/player-reducer
 */

/** @public P5.3 reads the mode for focus and announcements. */
export type PlayerMode = "cover" | "playing" | "paused" | "holding" | "interacting" | "sheet" | "ended"

/** How a page waits: the cover waits for a cut, an interaction page for an answer, the end page for nothing. */
export type PageKind = "cover" | "timed" | "interaction" | "end"

/** P5.3 renders settings and table, P5.11 share; later steps add their own. @public */
export type SheetName = "settings" | "table" | "share" | (string & {})

type TurnSource = "key" | "tap" | "swipe" | "button"

export interface PlayerState {
  mode: PlayerMode
  index: number
  /** The page the last turn left, for the turn animation's direction. */
  prevIndex: number | null
  resumeTo: PlayerMode | null
  lastTurn: "user" | "auto" | null
  sheet: SheetName | null
  /** Autoplay preference, already off under reduced motion. */
  autoplay: boolean
  kinds: readonly PageKind[]
}

export type PlayerEvent =
  | { type: "CHOOSE_CUT"; cut?: "full" | "pocket" }
  | { type: "SET_KINDS"; kinds: readonly PageKind[] }
  | { type: "NEXT" | "PREV"; source: TurnSource }
  | { type: "GOTO"; index: number; source: TurnSource }
  | { type: "DWELL_END" }
  | { type: "PAUSE" | "PLAY" }
  | { type: "HOLD_START" | "HOLD_END" }
  | { type: "INTERACT_START" | "INTERACT_END" }
  | { type: "OPEN_SHEET"; sheet: SheetName }
  | { type: "CLOSE_SHEET" }
  | { type: "HIDDEN" }
  | { type: "FOCUS_CONTROL" | "BLUR_CONTROL" }
  | { type: "READ_AGAIN" }
  | { type: "SET_AUTOPLAY"; autoplay: boolean }

/** A registry dwell as a page kind: `tap` is the cover, `hold` an interaction page, `end` the back cover. */
export function pageKind(dwell: number | "tap" | "hold" | "end"): PageKind {
  return dwell === "tap" ? "cover" : dwell === "hold" ? "interaction" : dwell === "end" ? "end" : "timed"
}

export function initPlayer({ kinds, autoplay }: { kinds: readonly PageKind[]; autoplay: boolean }): PlayerState {
  const mode: PlayerMode = kinds[0] === "cover" ? "cover" : kinds[0] === "end" ? "ended" : autoplay ? "playing" : "paused"
  return { mode, index: 0, prevIndex: null, resumeTo: null, lastTurn: null, sheet: null, autoplay, kinds }
}

const TEMPORARY: readonly PlayerMode[] = ["holding", "interacting", "sheet"]

/** Whether the story would be playing once a temporary mode ends. */
function wantsPlay(state: PlayerState): boolean {
  if (state.mode === "playing") return true
  if (state.mode === "cover" || state.mode === "ended") return state.autoplay
  return TEMPORARY.includes(state.mode) && state.resumeTo === "playing"
}

function turnTo(state: PlayerState, target: number, lastTurn: "user" | "auto"): PlayerState {
  const index = Math.max(0, Math.min(state.kinds.length - 1, target))
  if (index === state.index) return state
  const base: PlayerMode = wantsPlay(state) ? "playing" : "paused"
  const kind = state.kinds[index]
  const turned = { ...state, index, prevIndex: state.index, lastTurn, sheet: null }
  if (kind === "cover") return { ...turned, mode: "cover", resumeTo: null }
  if (kind === "end") return { ...turned, mode: "ended", resumeTo: null }
  if (kind === "interaction") return { ...turned, mode: "interacting", resumeTo: base }
  return { ...turned, mode: base, resumeTo: null }
}

/** Sets what a temporary mode returns to, or the mode itself when it is not temporary. */
function setPlay(state: PlayerState, play: boolean): PlayerState {
  if (TEMPORARY.includes(state.mode)) {
    const back = state.resumeTo === "playing" || state.resumeTo === "paused" ? (play ? "playing" : "paused") : state.resumeTo
    return { ...state, resumeTo: back }
  }
  // A member's Pause also cancels the resume that focus on a control was holding.
  if ((state.mode === "playing" || state.mode === "paused") && !play) return { ...state, mode: "paused", resumeTo: null }
  if (state.mode === "paused" && play) return { ...state, mode: "playing", resumeTo: null }
  return state
}

function canTurn(state: PlayerState): boolean {
  return state.mode !== "sheet" && state.mode !== "holding"
}

export function playerReducer(state: PlayerState, event: PlayerEvent): PlayerState {
  switch (event.type) {
    case "CHOOSE_CUT":
      return state.mode === "cover" ? turnTo(state, state.index + 1, "user") : state
    case "SET_KINDS":
      if (state.mode !== "cover" || state.index !== 0 || event.kinds.join() === state.kinds.join()) return state
      return { ...state, kinds: event.kinds }
    case "NEXT":
      if (!canTurn(state) || state.mode === "ended") return state
      return turnTo(state, state.index + 1, "user")
    case "PREV":
      return canTurn(state) ? turnTo(state, state.index - 1, "user") : state
    case "GOTO":
      return canTurn(state) ? turnTo(state, event.index, "user") : state
    case "DWELL_END":
      return state.mode === "playing" ? turnTo(state, state.index + 1, "auto") : state
    case "PAUSE":
      return setPlay(state, false)
    case "PLAY":
      return setPlay(state, true)
    case "HOLD_START":
      return state.mode === "playing" || state.mode === "paused" ? { ...state, mode: "holding", resumeTo: state.mode } : state
    case "INTERACT_START":
      return state.mode === "playing" || state.mode === "paused" ? { ...state, mode: "interacting", resumeTo: state.mode } : state
    case "HOLD_END":
      return state.mode === "holding" ? { ...state, mode: state.resumeTo ?? "paused", resumeTo: null } : state
    case "INTERACT_END":
      return state.mode === "interacting" ? { ...state, mode: state.resumeTo ?? "paused", resumeTo: null } : state
    case "OPEN_SHEET":
      if (state.mode === "sheet") return { ...state, sheet: event.sheet }
      // A sheet over a hold or an interaction returns to what those would have.
      return { ...state, mode: "sheet", sheet: event.sheet, resumeTo: TEMPORARY.includes(state.mode) ? (state.resumeTo ?? "paused") : state.mode }
    case "CLOSE_SHEET":
      return state.mode === "sheet" ? { ...state, mode: state.resumeTo ?? "paused", resumeTo: null, sheet: null } : state
    case "HIDDEN":
      return state.mode === "playing" ? { ...state, mode: "paused", resumeTo: null } : setPlay(state, false)
    case "FOCUS_CONTROL":
      return state.mode === "playing" ? { ...state, mode: "paused", resumeTo: "playing" } : state
    case "BLUR_CONTROL":
      return state.mode === "paused" && state.resumeTo === "playing" ? { ...state, mode: "playing", resumeTo: null } : state
    case "READ_AGAIN":
      return state.mode === "ended" ? turnTo(state, 1, "user") : state
    case "SET_AUTOPLAY": {
      const next = { ...state, autoplay: event.autoplay }
      return event.autoplay ? next : setPlay(next, false)
    }
  }
}
