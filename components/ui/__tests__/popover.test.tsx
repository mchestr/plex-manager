import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { PortalContainerProvider } from "@/components/ui/portal-container"

expect.extend(toHaveNoViolations)

function Example() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" />}>What counts as a play?</PopoverTrigger>
      <PopoverContent data-testid="popover">
        <PopoverTitle>What counts as a play</PopoverTitle>
        <PopoverDescription>More than half of an episode or film.</PopoverDescription>
      </PopoverContent>
    </Popover>
  )
}

describe("Popover", () => {
  it("opens a named dialog from its trigger, with no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "What counts as a play?" })
    await user.click(trigger)

    const popup = await screen.findByRole("dialog", { name: "What counts as a play" })
    expect(popup).toHaveAccessibleDescription("More than half of an episode or film.")
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("closes on Escape", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "What counts as a play?" }))
    await screen.findByRole("dialog")

    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("uses the dropdown layer, or the in-modal layer inside a dialog", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Example />)
    await user.click(screen.getByRole("button", { name: "What counts as a play?" }))
    expect((await screen.findByTestId("popover")).parentElement).toHaveClass("z-(--z-dropdown)")
    unmount()

    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Settings</DialogTitle>
          <Example />
        </DialogContent>
      </Dialog>
    )
    await user.click(await screen.findByRole("button", { name: "What counts as a play?" }))
    expect((await screen.findByTestId("popover")).parentElement).toHaveClass("z-(--z-popover-in-modal)")
  })

  it("renders in the provided container", async () => {
    const user = userEvent.setup()
    const container = document.createElement("div")
    document.body.append(container)
    render(
      <PortalContainerProvider container={container} popupProps={{ "data-field": "paper", className: "paper" }}>
        <Example />
      </PortalContainerProvider>
    )
    await user.click(screen.getByRole("button", { name: "What counts as a play?" }))

    const popup = await screen.findByTestId("popover")
    expect(container).toContainElement(popup)
    expect(popup).toHaveAttribute("data-field", "paper")
    expect(popup).toHaveClass("paper", "bg-popover")
    container.remove()
  })
})
