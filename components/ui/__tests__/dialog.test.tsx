import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ModalShell } from "@/components/ui/modal-shell"
import { PortalContainerProvider, usePopupLayer } from "@/components/ui/portal-container"

expect.extend(toHaveNoViolations)

function Layer() {
  return <span data-testid="layer">{usePopupLayer()}</span>
}

function Example({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  return (
    <>
      <button type="button">Before</button>
      <Dialog onOpenChange={onOpenChange}>
        <DialogTrigger render={<Button />}>Invite details</DialogTrigger>
        <DialogContent data-testid="dialog">
          <DialogHeader>
            <DialogTitle>Invite for Sam Rivera</DialogTitle>
            <DialogDescription>Sam can use this link once.</DialogDescription>
          </DialogHeader>
          <Layer />
          <DialogFooter>
            <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
            <Button>Copy link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

describe("Dialog", () => {
  it("opens named and described, with no axe violations", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Invite details" }))

    const dialog = await screen.findByRole("dialog", { name: "Invite for Sam Rivera" })
    expect(dialog).toHaveAccessibleDescription("Sam can use this link once.")
    expect(dialog).toHaveAttribute("data-testid", "dialog")
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("traps focus inside the panel", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Invite details" }))
    const dialog = await screen.findByRole("dialog")

    for (let i = 0; i < 5; i++) {
      await user.tab()
      // A focus guard at either end hands focus back into the panel.
      await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement))
    }
  })

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    render(<Example onOpenChange={onOpenChange} />)
    const trigger = screen.getByRole("button", { name: "Invite details" })
    await user.click(trigger)
    await screen.findByRole("dialog")

    await user.keyboard("{Escape}")

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "escape-key" }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("has a labelled Close button", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Invite details" }))
    await user.click(await screen.findByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("lifts popups inside it above it", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Invite details" }))
    expect(await screen.findByTestId("layer")).toHaveTextContent("z-(--z-popover-in-modal)")
  })

  it("does not close when a toast is pressed", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    render(
      <>
        <section data-slot="toast-viewport">
          <button type="button">Dismiss notification</button>
        </section>
        <Example onOpenChange={onOpenChange} />
      </>
    )
    await user.click(screen.getByRole("button", { name: "Invite details" }))
    await screen.findByRole("dialog")
    onOpenChange.mockClear()

    await user.click(screen.getByText("Dismiss notification"))

    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it("portals into the provided container and spreads its popup props", async () => {
    const user = userEvent.setup()
    const container = document.createElement("div")
    document.body.append(container)
    render(
      <PortalContainerProvider container={container} popupProps={{ "data-field": "paper" }}>
        <Example />
      </PortalContainerProvider>
    )
    await user.click(screen.getByRole("button", { name: "Invite details" }))

    const dialog = await screen.findByRole("dialog")
    expect(container).toContainElement(dialog)
    expect(dialog).toHaveAttribute("data-field", "paper")
    container.remove()
  })
})

describe("ModalShell adapter", () => {
  it("renders Dialog with the old props", async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(
      <ModalShell isOpen onClose={onClose} maxWidth="lg" labelledBy="t" describedBy="d" testId="shell">
        <h2 id="t">New announcement</h2>
        <p id="d">Shown on every member&apos;s home page.</p>
        <button type="button">Save</button>
      </ModalShell>
    )

    const dialog = await screen.findByRole("dialog", { name: "New announcement" })
    expect(dialog).toHaveAccessibleDescription("Shown on every member's home page.")
    expect(dialog).toHaveAttribute("data-testid", "shell")
    expect(dialog).toHaveClass("md:max-w-lg")
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()

    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("renders nothing while closed", () => {
    render(
      <ModalShell isOpen={false} onClose={jest.fn()}>
        <p>Hidden</p>
      </ModalShell>
    )
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument()
  })
})
