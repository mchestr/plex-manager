import { initPlayer, pageKind, playerReducer, type PageKind, type PlayerEvent, type PlayerState } from "../player-reducer"

// cover, three timed pages, an interaction page, a timed page, the back cover
const KINDS: PageKind[] = ["cover", "timed", "timed", "interaction", "timed", "end"]

function run(events: PlayerEvent[], state: PlayerState = initPlayer({ kinds: KINDS, autoplay: true })): PlayerState {
  return events.reduce(playerReducer, state)
}

const next: PlayerEvent = { type: "NEXT", source: "tap" }
const prev: PlayerEvent = { type: "PREV", source: "key" }

describe("pageKind", () => {
  it("reads the registry dwell", () => {
    expect(pageKind("tap")).toBe("cover")
    expect(pageKind("hold")).toBe("interaction")
    expect(pageKind("end")).toBe("end")
    expect(pageKind(8000)).toBe("timed")
  })
})

describe("playerReducer (design 14.3)", () => {
  it("starts on the cover and plays once a cut is chosen", () => {
    expect(run([]).mode).toBe("cover")
    expect(run([{ type: "CHOOSE_CUT" }])).toMatchObject({ mode: "playing", index: 1, prevIndex: 0, lastTurn: "user" })
  })

  it("stays paused after the cut when autoplay is off (reduced motion or the preference)", () => {
    const state = run([{ type: "CHOOSE_CUT" }], initPlayer({ kinds: KINDS, autoplay: false }))
    expect(state.mode).toBe("paused")
    expect(run([{ type: "DWELL_END" }], state).index).toBe(1)
  })

  it("turns automatically on DWELL_END and records it", () => {
    expect(run([{ type: "CHOOSE_CUT" }, { type: "DWELL_END" }])).toMatchObject({ mode: "playing", index: 2, lastTurn: "auto" })
  })

  it("keeps autoplay on through member turns", () => {
    const state = run([{ type: "CHOOSE_CUT" }, next, prev, next])
    expect(state).toMatchObject({ mode: "playing", index: 2, lastTurn: "user" })
  })

  it("ignores DWELL_END unless playing", () => {
    const paused = run([{ type: "CHOOSE_CUT" }, { type: "PAUSE" }])
    expect(run([{ type: "DWELL_END" }], paused)).toBe(paused)
  })

  it("pauses and plays", () => {
    const paused = run([{ type: "CHOOSE_CUT" }, { type: "PAUSE" }])
    expect(paused.mode).toBe("paused")
    expect(run([{ type: "PLAY" }], paused).mode).toBe("playing")
    expect(run([next], paused).mode).toBe("paused")
  })

  it("holds and resumes the mode it held", () => {
    const held = run([{ type: "CHOOSE_CUT" }, { type: "HOLD_START" }])
    expect(held).toMatchObject({ mode: "holding", resumeTo: "playing" })
    expect(run([next], held)).toBe(held)
    expect(run([{ type: "HOLD_END" }], held).mode).toBe("playing")
    expect(run([{ type: "CHOOSE_CUT" }, { type: "PAUSE" }, { type: "HOLD_START" }, { type: "HOLD_END" }]).mode).toBe("paused")
  })

  it("enters interacting on an interaction page and returns on INTERACT_END", () => {
    const quiz = run([{ type: "CHOOSE_CUT" }, next, next])
    expect(quiz).toMatchObject({ index: 3, mode: "interacting", resumeTo: "playing" })
    expect(run([{ type: "INTERACT_END" }], quiz).mode).toBe("playing")
    expect(run([next], quiz)).toMatchObject({ index: 4, mode: "playing" })
  })

  it("enters interacting for a scrubber on a timed page", () => {
    const state = run([{ type: "CHOOSE_CUT" }, { type: "INTERACT_START" }])
    expect(state).toMatchObject({ mode: "interacting", resumeTo: "playing" })
    expect(run([{ type: "INTERACT_END" }], state).mode).toBe("playing")
  })

  it("resumes after CLOSE_SHEET only if the story was playing", () => {
    const fromPlaying = run([{ type: "CHOOSE_CUT" }, { type: "OPEN_SHEET", sheet: "settings" }])
    expect(fromPlaying).toMatchObject({ mode: "sheet", sheet: "settings" })
    expect(run([{ type: "CLOSE_SHEET" }], fromPlaying)).toMatchObject({ mode: "playing", sheet: null })

    const fromPaused = run([{ type: "CHOOSE_CUT" }, { type: "PAUSE" }, { type: "OPEN_SHEET", sheet: "table" }])
    expect(run([{ type: "CLOSE_SHEET" }], fromPaused).mode).toBe("paused")

    const fromCover = run([{ type: "OPEN_SHEET", sheet: "settings" }])
    expect(run([{ type: "CLOSE_SHEET" }], fromCover).mode).toBe("cover")
  })

  it("ignores turns and dwell ends while a sheet is open", () => {
    const sheet = run([{ type: "CHOOSE_CUT" }, { type: "OPEN_SHEET", sheet: "share" }])
    expect(run([next, { type: "DWELL_END" }], sheet)).toBe(sheet)
  })

  it("pauses on a hidden tab", () => {
    expect(run([{ type: "CHOOSE_CUT" }, { type: "HIDDEN" }]).mode).toBe("paused")
    const held = run([{ type: "CHOOSE_CUT" }, { type: "HOLD_START" }, { type: "HIDDEN" }, { type: "HOLD_END" }])
    expect(held.mode).toBe("paused")
  })

  it("pauses while a control has focus and resumes when it leaves", () => {
    const focused = run([{ type: "CHOOSE_CUT" }, { type: "FOCUS_CONTROL" }])
    expect(focused).toMatchObject({ mode: "paused", resumeTo: "playing" })
    expect(run([{ type: "BLUR_CONTROL" }], focused).mode).toBe("playing")
    // a member's Pause while focused stays paused
    expect(run([{ type: "PAUSE" }, { type: "BLUR_CONTROL" }], focused).mode).toBe("paused")
    // a member's own pause is never resumed by a blur
    expect(run([{ type: "CHOOSE_CUT" }, { type: "PAUSE" }, { type: "BLUR_CONTROL" }]).mode).toBe("paused")
  })

  it("enters ended on the back cover, and Read again goes to page 02", () => {
    const ended = run([{ type: "CHOOSE_CUT" }, { type: "GOTO", index: 5, source: "key" }])
    expect(ended).toMatchObject({ mode: "ended", index: 5 })
    expect(run([next], ended)).toBe(ended)
    expect(run([{ type: "READ_AGAIN" }], ended)).toMatchObject({ mode: "playing", index: 1, lastTurn: "user" })
    expect(run([{ type: "OPEN_SHEET", sheet: "share" }, { type: "CLOSE_SHEET" }], ended).mode).toBe("ended")
  })

  it("returns to the cover state on the cover", () => {
    expect(run([{ type: "CHOOSE_CUT" }, prev])).toMatchObject({ mode: "cover", index: 0 })
  })

  it("clamps GOTO and ignores a turn to the same page", () => {
    const state = run([{ type: "CHOOSE_CUT" }])
    expect(run([{ type: "GOTO", index: 99, source: "key" }], state).index).toBe(5)
    expect(run([{ type: "GOTO", index: 1, source: "key" }], state)).toBe(state)
  })

  it("pauses when autoplay is turned off and plays the next cut when it is on", () => {
    const off = run([{ type: "CHOOSE_CUT" }, { type: "SET_AUTOPLAY", autoplay: false }])
    expect(off.mode).toBe("paused")
    const cover = run([{ type: "SET_AUTOPLAY", autoplay: false }, { type: "SET_AUTOPLAY", autoplay: true }, { type: "CHOOSE_CUT" }])
    expect(cover.mode).toBe("playing")
  })
})
