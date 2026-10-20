import { classifyPress, isHold, pausePress, type PointerSample } from "../gestures"

const W = 390

/** A straight press from (x, y) moving (dx, dy) over `ms`. */
function press(x: number, y: number, dx: number, dy: number, ms: number): PointerSample[] {
  return [
    { x, y, t: 1000 },
    { x: x + dx / 2, y: y + dy / 2, t: 1000 + ms / 2 },
    { x: x + dx, y: y + dy, t: 1000 + ms },
  ]
}

describe("classifyPress", () => {
  it("splits taps at 30% of the width", () => {
    expect(classifyPress(press(W * 0.29, 300, 0, 0, 80), W, "artboard")).toEqual({ kind: "tap", direction: "back" })
    expect(classifyPress(press(W * 0.31, 300, 0, 0, 80), W, "artboard")).toEqual({ kind: "tap", direction: "forward" })
  })

  it("ignores presses on the chrome and on interactive elements", () => {
    expect(classifyPress(press(300, 300, 0, 0, 80), W, "chrome").kind).toBe("none")
    expect(classifyPress(press(300, 300, -80, 0, 100), W, "interactive").kind).toBe("none")
  })

  it("turns on a 48 px horizontal swipe, however slow", () => {
    expect(classifyPress(press(300, 300, -48, 0, 1000), W, "artboard")).toEqual({ kind: "swipe", direction: "forward" })
    expect(classifyPress(press(100, 300, 48, 0, 1000), W, "artboard")).toEqual({ kind: "swipe", direction: "back" })
    expect(classifyPress(press(300, 300, -47, 0, 1000), W, "artboard").kind).toBe("none")
  })

  it("turns on a fast short swipe at 0.3 px/ms", () => {
    expect(classifyPress(press(300, 300, -30, 0, 100), W, "artboard")).toEqual({ kind: "swipe", direction: "forward" })
    expect(classifyPress(press(300, 300, -30, 0, 101), W, "artboard").kind).toBe("none")
  })

  it("closes on a 96 px swipe down", () => {
    expect(classifyPress(press(200, 100, 0, 96, 300), W, "artboard")).toEqual({ kind: "close" })
    expect(classifyPress(press(200, 100, 0, 95, 300), W, "artboard").kind).toBe("none")
    expect(classifyPress(press(200, 300, 0, -120, 300), W, "artboard").kind).toBe("none")
  })

  it("is a hold at 250 ms without travel, and a tap before that", () => {
    expect(classifyPress(press(200, 300, 2, 2, 249), W, "artboard").kind).toBe("tap")
    expect(classifyPress(press(200, 300, 2, 2, 251), W, "artboard").kind).toBe("hold")
  })
})

describe("isHold", () => {
  it("needs 250 ms inside the tap slop", () => {
    const still = press(200, 300, 3, 0, 0)
    expect(isHold(still, 1249)).toBe(false)
    expect(isHold(still, 1251)).toBe(true)
    expect(isHold(press(200, 300, 30, 0, 100), 1300)).toBe(false)
  })
})

describe("pausePress", () => {
  it("opens Settings on a 500 ms press and toggles otherwise", () => {
    expect(pausePress(499)).toBe("toggle")
    expect(pausePress(500)).toBe("settings")
  })

  it("never counts as a hold, because Pause sits on the chrome", () => {
    expect(classifyPress(press(360, 30, 0, 0, 600), W, "chrome").kind).toBe("none")
  })
})
