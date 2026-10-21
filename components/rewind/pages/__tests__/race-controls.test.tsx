import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useReducedMotion } from "motion/react"

import { RacePage } from "@/components/rewind/pages/race"
import { PlayerProvider } from "@/components/rewind/stage/player-context"
import { issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { REWIND_FEATURES, type RewindFeatureFlags } from "@/lib/rewind/features"
import { standingsAfter } from "@/lib/rewind/pages/race"
import type { RaceData } from "@/lib/rewind/pages/race.schema"

import { loadIssues, pageData } from "./page-copy-rules"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue
let data: RaceData
/** Each run's `finished`, settled by the test. */
let settle: Array<() => void> = []
const animate = jest.fn(() => {
  let done = () => {}
  const finished = new Promise<void>((resolve) => {
    done = resolve
  })
  settle.push(done)
  return { cancel: jest.fn(() => done()), finished }
})
const send = jest.fn()

const flags = (on: boolean): RewindFeatureFlags =>
  Object.fromEntries(REWIND_FEATURES.map(({ key }) => [key, on && key === "race.scrubber"])) as Record<(typeof REWIND_FEATURES)[number]["key"], boolean>

beforeAll(async () => {
  heavy = (await loadIssues()).get("heavy")!
  data = pageData<RaceData>(heavy, "race")!
  Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true })
})

afterAll(() => {
  Reflect.deleteProperty(Element.prototype, "animate")
})

beforeEach(() => {
  animate.mockClear()
  send.mockClear()
  settle = []
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

function renderRace({ on = true, race = data }: { on?: boolean; race?: RaceData } = {}) {
  return render(
    <PlayerProvider value={send}>
      <RacePage data={race} issue={issueContext(heavy, { features: flags(on) })} />
    </PlayerProvider>
  )
}

const finishRun = () =>
  act(async () => {
    settle.forEach((done) => done())
  })

describe("Race scrubber and Replay (P8.3)", () => {
  it("shows the controls only after the single run", async () => {
    renderRace()
    expect(animate).toHaveBeenCalled()
    expect(screen.queryByTestId("rewind-race-controls")).not.toBeInTheDocument()
    await finishRun()
    expect(await screen.findByTestId("rewind-race-scrubber")).toBeInTheDocument()
    expect(screen.getByTestId("rewind-race-play")).toHaveTextContent("Replay")
  })

  it("shows them at once under reduced motion", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    renderRace()
    expect(await screen.findByTestId("rewind-race-controls")).toHaveAttribute("data-rw-interactive")
    expect(animate).not.toHaveBeenCalled()
  })

  it("speaks the month: ArrowRight from August gives September", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const user = userEvent.setup()
    renderRace()
    const slider = await screen.findByRole("slider", { name: "Month" })
    expect(slider).toHaveAttribute("aria-valuetext", "November")
    act(() => slider.focus())
    await user.keyboard("{Home}")
    expect(slider).toHaveAttribute("aria-valuetext", "January")
    for (let i = 0; i < 7; i++) await user.keyboard("{ArrowRight}")
    expect(slider).toHaveAttribute("aria-valuetext", "August")
    await user.keyboard("{ArrowRight}")
    expect(slider).toHaveAttribute("aria-valuetext", "September")
  })

  it("updates the live line once per debounce", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    jest.useFakeTimers()
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
      renderRace()
      const slider = await screen.findByRole("slider", { name: "Month" })
      act(() => slider.focus())
      await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}")
      const live = screen.getByTestId("rewind-race-live")
      expect(live).toHaveTextContent("")
      await act(async () => {
        await jest.advanceTimersByTimeAsync(400)
      })
      expect(live).toHaveTextContent(standingsAfter(data, data.frames.length - 4))
      expect(live.textContent).toMatch(/^Standings after August: .+ first, .+\.$/)
    } finally {
      jest.useRealTimers()
    }
  })

  it("pauses autoplay while a finger is down or focus is inside, and resumes when it leaves", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    renderRace()
    const controls = await screen.findByTestId("rewind-race-controls")
    fireEvent.pointerDown(controls)
    expect(send).toHaveBeenLastCalledWith({ type: "INTERACT_START" })
    fireEvent.pointerUp(controls)
    expect(send).toHaveBeenLastCalledWith({ type: "INTERACT_END" })
    fireEvent.focus(screen.getByRole("slider", { name: "Month" }))
    expect(send).toHaveBeenLastCalledWith({ type: "INTERACT_START" })
    fireEvent.blur(screen.getByRole("slider", { name: "Month" }), { relatedTarget: document.body })
    expect(send).toHaveBeenLastCalledWith({ type: "INTERACT_END" })
  })

  it("seeks without animating, and Replay runs the months again from January", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const user = userEvent.setup()
    renderRace()
    const slider = await screen.findByRole("slider", { name: "Month" })
    act(() => slider.focus())
    await user.keyboard("{Home}")
    expect(animate).not.toHaveBeenCalled()
    const firstBar = screen.getAllByTestId("rewind-race-row")[0].querySelector("rect")!
    expect(firstBar.style.transform).toMatch(/^scaleX\(/)
    await user.click(screen.getByTestId("rewind-race-play"))
    const [, timing] = animate.mock.calls[0] as unknown[]
    expect(timing).toMatchObject({ delay: 0, duration: data.frames.length * 520 })
    expect(slider).toHaveAttribute("aria-valuetext", "November")
  })

  it("reaches December on a 12-frame race after the final cut", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const user = userEvent.setup()
    const lastFrame = data.frames.at(-1)!
    const race: RaceData = { ...data, frames: [...data.frames, { ...lastFrame, month: 12 }] }
    renderRace({ race })
    const slider = await screen.findByRole("slider", { name: "Month" })
    expect(slider).toHaveAttribute("aria-valuetext", "December")
    act(() => slider.focus())
    await user.keyboard("{Home}{End}")
    expect(slider).toHaveAttribute("aria-valuetext", "December")
  })

  it("renders neither control with the flag off", async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    renderRace({ on: false })
    await act(async () => {})
    expect(screen.queryByTestId("rewind-race-scrubber")).not.toBeInTheDocument()
    expect(screen.queryByTestId("rewind-race-play")).not.toBeInTheDocument()
  })
})
