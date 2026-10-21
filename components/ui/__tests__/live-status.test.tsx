import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { LiveRefreshProvider, LiveRefreshStatus, LiveStatus, useHoldLiveRefresh } from "@/components/ui/live-status"

const mockRefresh = jest.fn()
const mockRouter = { refresh: mockRefresh }
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter }))

const T0 = new Date("2026-10-21T12:00:00Z").getTime()

beforeEach(() => {
  jest.useFakeTimers({ now: T0 })
  mockRefresh.mockClear()
})

afterEach(() => {
  jest.useRealTimers()
})

describe("LiveStatus", () => {
  it("counts up from renderedAt each second, with no live region", () => {
    render(<LiveStatus renderedAt={T0} paused={false} onPausedChange={() => {}} />)
    expect(screen.getByTestId("live-status-updated")).toHaveTextContent("Updated 0s ago")

    act(() => jest.advanceTimersByTime(3000))
    expect(screen.getByTestId("live-status-updated")).toHaveTextContent("Updated 3s ago")

    act(() => jest.advanceTimersByTime(120_000))
    expect(screen.getByTestId("live-status-updated")).toHaveTextContent("Updated 2m ago")
    expect(screen.getByTestId("live-status").querySelector("[aria-live]")).toBeNull()
  })

  it("starts again from a newer render", () => {
    const { rerender } = render(<LiveStatus renderedAt={T0} paused={false} onPausedChange={() => {}} />)
    act(() => jest.advanceTimersByTime(8000))
    rerender(<LiveStatus renderedAt={T0 + 8000} paused={false} onPausedChange={() => {}} />)
    expect(screen.getByTestId("live-status-updated")).toHaveTextContent("Updated 0s ago")
  })

  it("is a Toggle with the pressed state in aria-pressed", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    function Harness() {
      const [paused, setPaused] = useState(false)
      return <LiveStatus renderedAt={T0} paused={paused} onPausedChange={setPaused} />
    }
    render(<Harness />)
    const toggle = screen.getByRole("button", { name: "Pause live updates" })
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    expect(toggle).toHaveAccessibleName("Pause live updates")
  })
})

describe("LiveRefreshProvider", () => {
  function Holder({ open }: { open: boolean }) {
    useHoldLiveRefresh(open)
    return null
  }

  it("refreshes the page, and not while the viewer paused it", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(
      <LiveRefreshProvider renderedAt={T0} intervalMs={10_000}>
        <LiveRefreshStatus />
      </LiveRefreshProvider>
    )
    act(() => jest.advanceTimersByTime(10_000))
    expect(mockRefresh).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Pause live updates" }))
    act(() => jest.advanceTimersByTime(30_000))
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("holds the refresh while a dialog or menu is open", () => {
    const { rerender } = render(
      <LiveRefreshProvider renderedAt={T0} intervalMs={10_000}>
        <Holder open />
      </LiveRefreshProvider>
    )
    act(() => jest.advanceTimersByTime(30_000))
    expect(mockRefresh).not.toHaveBeenCalled()

    rerender(
      <LiveRefreshProvider renderedAt={T0} intervalMs={10_000}>
        <Holder open={false} />
      </LiveRefreshProvider>
    )
    act(() => jest.advanceTimersByTime(10_000))
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })
})
