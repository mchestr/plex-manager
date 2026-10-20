import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

expect.extend(toHaveNoViolations)

function Example() {
  return (
    <>
      <button type="button">Before</button>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Refresh libraries" />} />
        <TooltipContent data-testid="tooltip">Refresh libraries</TooltipContent>
      </Tooltip>
    </>
  )
}

describe("Tooltip", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  // Base UI opens a tooltip on keyboard focus at once; only hover waits.
  it("opens on keyboard focus and closes on Escape", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<Example />)
    screen.getByRole("button", { name: "Before" }).focus()

    await user.tab()
    expect(screen.getByRole("button", { name: "Refresh libraries" })).toHaveFocus()
    expect(screen.getByTestId("tooltip")).toHaveTextContent("Refresh libraries")
    expect(screen.getByTestId("tooltip")).toHaveClass("text-caption")

    await user.keyboard("{Escape}")
    await act(async () => jest.advanceTimersByTime(500))
    expect(screen.queryByTestId("tooltip")).not.toBeInTheDocument()
  })

  it("opens on hover after 400ms and stays while the trigger is hovered, with no axe violations", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<Example />)

    await user.hover(screen.getByRole("button", { name: "Refresh libraries" }))
    await act(async () => jest.advanceTimersByTime(350))
    expect(screen.queryByTestId("tooltip")).not.toBeInTheDocument()
    await act(async () => jest.advanceTimersByTime(100))
    expect(screen.getByTestId("tooltip")).toBeInTheDocument()

    await act(async () => jest.advanceTimersByTime(2000))
    expect(screen.getByTestId("tooltip")).toBeInTheDocument()

    jest.useRealTimers()
    // Popups portal outside the page's landmarks, as they do in the app.
    expect(await axe(document.body, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })
})
