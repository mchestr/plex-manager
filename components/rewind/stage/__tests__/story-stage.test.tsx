import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useReducedMotion } from "motion/react"
import { Profiler } from "react"

import { expectNoDarkInsideLight } from "@/lib/design/testing"
import { CoverCuts } from "@/components/rewind/pages/cover-cuts"
import type { IssuePageType, RewindPageType } from "@/lib/rewind/registry"

import { StoryStage } from "../story-stage"

import { LLM_COPY, stagePages } from "./stage-fixture"

const push = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

const TYPES: IssuePageType[] = ["cover", "number", "top-shows", "clock", "centrefold", "back-cover"]
const pages = stagePages(TYPES)

function renderStage(onCommit?: () => void) {
  const stage = <StoryStage pages={pages} year={2026} archetype="midnight-marathoner" closeHref="/home" copy={LLM_COPY} />
  return render(
    <div data-theme="rewind">{onCommit ? <Profiler id="stage" onRender={onCommit}>{stage}</Profiler> : stage}</div>
  )
}

const current = () => screen.getAllByTestId("rewind-page").find((page) => page.hasAttribute("data-current"))
const segment = () => screen.getByTestId("rewind-progress-current")

beforeEach(() => {
  push.mockClear()
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

describe("StoryStage", () => {
  it("hides Pause on the cover and shows it once a cut is chosen", async () => {
    const user = userEvent.setup()
    renderStage()
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "cover")
    expect(screen.queryByTestId("rewind-pause")).not.toBeInTheDocument()
    expect(screen.getByTestId("rewind-settings")).toHaveAttribute("aria-haspopup", "dialog")

    await user.keyboard("{ArrowRight}")
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "playing")
    expect(screen.getByTestId("rewind-pause")).toHaveAccessibleName("Pause")
    expect(screen.getByTestId("rewind-folio")).toHaveTextContent("02/06The number")
  })

  it("turns one page when the progress segment's animation ends", async () => {
    const user = userEvent.setup()
    renderStage()
    await user.keyboard("{ArrowRight}")
    expect(current()).toHaveAttribute("data-index", "1")
    expect(segment()).toHaveAttribute("data-playing", "true")

    fireEvent.animationEnd(segment())
    expect(current()).toHaveAttribute("data-index", "2")
    expect(current()).toHaveAttribute("data-turn", "forward")
    expect(screen.getAllByTestId("rewind-page")[1]).toHaveAttribute("data-leaving", "forward")
  })

  it("pauses when the tab is hidden", async () => {
    const user = userEvent.setup()
    renderStage()
    await user.keyboard("{ArrowRight}")
    jest.spyOn(document, "visibilityState", "get").mockReturnValue("hidden")
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "paused")
    expect(segment()).toHaveAttribute("data-playing", "false")
    expect(screen.getByTestId("rewind-pause")).toHaveAccessibleName("Play")
    jest.restoreAllMocks()
  })

  it("commits nothing while a dwell runs", async () => {
    jest.useFakeTimers()
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      const onCommit = jest.fn()
      renderStage(onCommit)
      await user.keyboard("{ArrowRight}")
      // The turn, then the new neighbour's reveal in idle time (P7.15).
      await act(async () => {
        await jest.advanceTimersByTimeAsync(500)
      })
      onCommit.mockClear()

      await act(async () => {
        await jest.advanceTimersByTimeAsync(6600)
      })
      expect(onCommit).not.toHaveBeenCalled()
      expect(current()).toHaveAttribute("data-index", "1")
    } finally {
      jest.useRealTimers()
    }
  })

  it("keeps autoplay off under reduced motion", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const user = userEvent.setup()
    renderStage()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "paused")
  })

  it("turns with taps, the arrows and the page buttons, and keeps playing after a member turn", async () => {
    const user = userEvent.setup()
    renderStage()
    const layer = screen.getByTestId("rewind-pages")
    layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844, x: 0, y: 0, toJSON: () => ({}) })

    fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: 300, clientY: 400 })
    fireEvent.pointerUp(layer, { pointerId: 1, button: 0, clientX: 300, clientY: 400 })
    expect(current()).toHaveAttribute("data-index", "1")

    await user.keyboard("{ArrowRight}")
    expect(current()).toHaveAttribute("data-index", "2")

    fireEvent.pointerDown(layer, { pointerId: 2, button: 0, clientX: 50, clientY: 400 })
    fireEvent.pointerUp(layer, { pointerId: 2, button: 0, clientX: 50, clientY: 400 })
    expect(current()).toHaveAttribute("data-index", "1")
    expect(current()).toHaveAttribute("data-turn", "back")

    await user.click(screen.getByTestId("rewind-next"))
    expect(current()).toHaveAttribute("data-index", "2")
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "playing")
  })

  it("hides the chrome while the artboard is held, and resumes on release", () => {
    jest.useFakeTimers()
    try {
      renderStage()
      fireEvent.keyDown(screen.getByTestId("rewind-stage"), { key: "ArrowRight" })
      const layer = screen.getByTestId("rewind-pages")
      fireEvent.pointerDown(layer, { pointerId: 1, button: 0, clientX: 200, clientY: 400 })
      act(() => {
        jest.advanceTimersByTime(260)
      })
      expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "holding")
      expect(screen.getByTestId("rewind-chrome-top")).toHaveClass("opacity-0")

      fireEvent.pointerUp(layer, { pointerId: 1, button: 0, clientX: 200, clientY: 400 })
      expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "playing")
      expect(current()).toHaveAttribute("data-index", "1")
    } finally {
      jest.useRealTimers()
    }
  })

  it("ignores taps inside an interactive island", () => {
    render(
      <div data-theme="rewind">
        <StoryStage pages={[{ type: "number", content: <button data-rw-interactive>Pick</button> }, { type: "clock", content: null }]} year={2026} archetype={null} closeHref="/" copy={LLM_COPY} />
      </div>
    )
    const button = screen.getByRole("button", { name: "Pick", hidden: true })
    fireEvent.pointerDown(button, { pointerId: 1, button: 0, clientX: 300, clientY: 400 })
    fireEvent.pointerUp(button, { pointerId: 1, button: 0, clientX: 300, clientY: 400 })
    expect(current()).toHaveAttribute("data-index", "0")
  })

  it("closes with Esc and with Close", async () => {
    const user = userEvent.setup()
    renderStage()
    await user.keyboard("{Escape}")
    expect(push).toHaveBeenCalledWith("/home")
    expect(screen.getByTestId("rewind-close")).toHaveAttribute("href", "/home")
  })

  it("shows Table on chart pages and the solid poster share on the centrefold", async () => {
    const user = userEvent.setup()
    renderStage()
    expect(screen.queryByTestId("rewind-table-toggle")).not.toBeInTheDocument()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByTestId("rewind-table-toggle")).toBeInTheDocument()
    expect(screen.getByTestId("rewind-share-slide")).toBeInTheDocument()

    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}")
    expect(screen.getByTestId("rewind-share-poster")).toHaveTextContent("Share the poster")

    await user.click(screen.getByTestId("rewind-table-toggle"))
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "sheet")
    await user.keyboard("{Escape}")
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "playing")
  })

  it("ends on the back cover with no Pause, and hides pages beyond the neighbours", async () => {
    const user = userEvent.setup()
    const { container } = renderStage()
    await user.keyboard("{End}")
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "ended")
    expect(screen.queryByTestId("rewind-pause")).not.toBeInTheDocument()
    const all = screen.getAllByTestId("rewind-page", { hidden: true } as never)
    // The jump shows the back cover at once; its new neighbour is revealed after the turn, in idle time (P7.15).
    expect(all.map((p) => p.hidden)).toEqual([true, true, true, true, true, false])
    await waitFor(() => expect(all.map((p) => p.hidden)).toEqual([true, true, true, true, false, false]))
    expect(all[4]).toHaveAttribute("inert")
    expectNoDarkInsideLight(container)
  })

  it("opens Settings from a long press on Pause instead of toggling it", () => {
    jest.useFakeTimers()
    try {
      renderStage()
      fireEvent.keyDown(screen.getByTestId("rewind-stage"), { key: "ArrowRight" })
      const pause = screen.getByTestId("rewind-pause")
      fireEvent.pointerDown(pause)
      act(() => jest.advanceTimersByTime(499))
      fireEvent.click(pause)
      expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "paused")

      fireEvent.pointerDown(screen.getByTestId("rewind-pause"))
      act(() => jest.advanceTimersByTime(600))
      fireEvent.click(screen.getByTestId("rewind-pause"))
      expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "sheet")
    } finally {
      jest.useRealTimers()
    }
  })
})

describe("StoryStage cuts (P7.3)", () => {
  const FULL: IssuePageType[] = ["cover", "number", "bookends", "guess", "top-shows", "top-films", "clock", "calendar", "centrefold", "back-cover"]
  const POCKET: RewindPageType[] = ["cover", "number", "short-list", "calendar", "centrefold", "back-cover"]
  const withCuts = (types: RewindPageType[]) =>
    stagePages(types).map((page) =>
      page.type === "cover"
        ? { ...page, content: <CoverCuts full={{ label: "Read the full issue", meta: "" }} pocket={{ label: "Pocket edition", meta: "" }} /> }
        : page
    )

  function renderCuts() {
    return render(
      <div data-theme="rewind">
        <StoryStage pages={withCuts(FULL)} pocket={withCuts(POCKET)} year={2026} archetype="midnight-marathoner" closeHref="/home" copy={LLM_COPY} />
      </div>
    )
  }

  beforeEach(() => window.sessionStorage.clear())

  it("swaps to the pocket cut and renumbers the folio, keeping the choice for a reload", async () => {
    const user = userEvent.setup()
    const { unmount } = renderCuts()
    await user.click(screen.getByTestId("rewind-cut-pocket"))
    expect(screen.getByTestId("rewind-folio")).toHaveTextContent("02/06The number")
    await user.keyboard("{ArrowRight}")
    expect(screen.getByTestId("rewind-folio")).toHaveTextContent("03/06Short list")
    expect(window.sessionStorage.getItem("rewind:cut:2026")).toBe("pocket")

    unmount()
    renderCuts()
    expect(screen.getByTestId("rewind-folio")).toHaveTextContent("01/06Cover")
    await user.keyboard("{ArrowRight}")
    expect(screen.getByTestId("rewind-folio")).toHaveTextContent("02/06The number")
  })

  it("plays the full issue from its button", async () => {
    const user = userEvent.setup()
    renderCuts()
    await user.click(screen.getByTestId("rewind-cut-full"))
    expect(screen.getByTestId("rewind-folio")).toHaveTextContent("02/10The number")
    expect(window.sessionStorage.getItem("rewind:cut:2026")).toBe("full")
  })

  it("opens a one-page postcard in the ended state", () => {
    render(
      <div data-theme="rewind">
        <StoryStage pages={stagePages(["postcard"])} year={2026} archetype={null} closeHref="/home" copy={LLM_COPY} />
      </div>
    )
    expect(screen.getByTestId("rewind-stage")).toHaveAttribute("data-mode", "ended")
    expect(screen.queryByTestId("rewind-pause")).not.toBeInTheDocument()
    expect(screen.getByTestId("rewind-folio")).toHaveTextContent("01/01Postcard")
  })

  describe("first tap completes a count-up (P8.3, stage.tap-completes)", () => {
    /** Page 02 with its odometer still rising, as `getAnimations` would report it. */
    async function onNumberPage(tapCompletes: boolean) {
      const user = userEvent.setup()
      render(<StoryStage pages={pages} year={2026} archetype="midnight-marathoner" closeHref="/home" copy={LLM_COPY} tapCompletes={tapCompletes} />)
      const layer = screen.getByTestId("rewind-pages")
      layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: 390, height: 844, right: 390, bottom: 844, x: 0, y: 0, toJSON: () => ({}) })
      await user.keyboard("{ArrowRight}")
      const odometer = { playState: "running", effect: { target: current()!.querySelector("h2"), getComputedTiming: () => ({ endTime: 1200 }) }, finish: jest.fn() }
      odometer.finish.mockImplementation(() => {
        odometer.playState = "finished"
      })
      Object.defineProperty(current()!, "getAnimations", { value: () => [odometer], configurable: true })
      const tap = (id: number) => {
        fireEvent.pointerDown(layer, { pointerId: id, button: 0, clientX: 300, clientY: 400 })
        fireEvent.pointerUp(layer, { pointerId: id, button: 0, clientX: 300, clientY: 400 })
      }
      return { odometer, tap }
    }

    it("lands the odometer on the first tap and turns the page on the second", async () => {
      const { odometer, tap } = await onNumberPage(true)
      tap(1)
      expect(odometer.finish).toHaveBeenCalledTimes(1)
      expect(current()).toHaveAttribute("data-index", "1")
      tap(2)
      expect(current()).toHaveAttribute("data-index", "2")
    })

    it("turns at once with the flag off", async () => {
      const { odometer, tap } = await onNumberPage(false)
      tap(1)
      expect(odometer.finish).not.toHaveBeenCalled()
      expect(current()).toHaveAttribute("data-index", "2")
    })
  })
})
