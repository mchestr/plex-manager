/**
 * The Keep meter (UX 9.2): "{used} of {limit} Keeps used" from the page's
 * provider, "See your Keeps" moving focus to the Your Keeps heading, the
 * limit line only at the limit, and nothing without member Keeps.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { KeepsProvider } from "@/components/leaving-soon/keep-button"
import { KeepMeter, meterLimitWords } from "@/components/leaving-soon/keep-meter"

jest.mock("@/actions/cleanup-keeps", () => ({ keepCleanupTitle: jest.fn(), removeMyCleanupKeep: jest.fn() }))

const METER = { enabled: true, limit: 20, used: 2, days: 90 }

function renderMeter(meter: Partial<typeof METER> = {}) {
  return render(
    <KeepsProvider keeps={{ ...METER, ...meter }}>
      <KeepMeter />
      <h2 id="leaving-soon-my-keeps-heading" tabIndex={-1}>
        Your Keeps
      </h2>
    </KeepsProvider>
  )
}

describe("KeepMeter", () => {
  it("counts the Keeps in use below the limit, with no limit line", () => {
    renderMeter()

    expect(screen.getByTestId("leaving-soon-keep-meter")).toHaveTextContent("2 of 20 Keeps used")
    expect(screen.queryByTestId("leaving-soon-keep-limit")).not.toBeInTheDocument()
  })

  it("names the limit under the meter at the limit", () => {
    renderMeter({ used: 20 })

    expect(screen.getByTestId("leaving-soon-keep-meter")).toHaveTextContent("20 of 20 Keeps used")
    expect(screen.getByTestId("leaving-soon-keep-limit")).toHaveTextContent("You keep 20 titles. End a Keep to keep another.")
  })

  it("moves focus to the Your Keeps heading from See your Keeps", async () => {
    const user = userEvent.setup()
    renderMeter()

    await user.click(screen.getByTestId("leaving-soon-keeps-link"))
    expect(screen.getByRole("heading", { name: "Your Keeps" })).toHaveFocus()
  })

  it("renders nothing without member Keeps or outside a provider", () => {
    const { container } = renderMeter({ enabled: false })
    expect(screen.queryByTestId("leaving-soon-keep-meter")).not.toBeInTheDocument()
    expect(container.querySelector("h2")).toBeInTheDocument()

    const alone = render(<KeepMeter />)
    expect(alone.container).toBeEmptyDOMElement()
  })

  it("says title for a limit of one", () => {
    expect(meterLimitWords(1)).toBe("You keep 1 title. End a Keep to keep another.")
  })
})
