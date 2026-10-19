import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"
import { CONFIRM_FALLBACK_ERROR, ConfirmDialog } from "@/components/ui/confirm-dialog"

expect.extend(toHaveNoViolations)

function deferred() {
  let resolve: (value: { error?: string }) => void = () => {}
  const promise = new Promise<{ error?: string }>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const action = props.action ?? jest.fn(async () => ({}))
  render(
    <ConfirmDialog
      trigger={<Button variant="destructive">Remove access</Button>}
      title="Remove Plex access for Sam Rivera?"
      description="Sam loses every shared library now."
      confirmLabel="Remove access"
      pendingLabel="Removing"
      tone="destructive"
      {...props}
      action={action}
    />
  )
  return action
}

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Remove access" }))
  return screen.findByRole("alertdialog", { name: "Remove Plex access for Sam Rivera?" })
}

const confirmButton = (dialog: HTMLElement) =>
  [...dialog.querySelectorAll<HTMLButtonElement>("[data-slot=alert-dialog-action]")][0]

describe("ConfirmDialog", () => {
  it("opens from its trigger with no axe violations", async () => {
    const user = userEvent.setup()
    renderDialog()
    const dialog = await open(user)
    expect(dialog).toHaveAccessibleDescription("Sam loses every shared library now.")
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("while pending, disables both buttons, shows the pending label and ignores Escape", async () => {
    const user = userEvent.setup()
    const pending = deferred()
    renderDialog({ action: () => pending.promise })
    const dialog = await open(user)

    await user.click(confirmButton(dialog))

    const confirm = confirmButton(dialog)
    expect(confirm).toHaveAttribute("aria-busy", "true")
    expect(confirm).toHaveAttribute("aria-disabled", "true")
    expect(confirm).toHaveTextContent("Removing")
    expect(confirm.querySelector("[data-slot=spinner]")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled()

    await user.keyboard("{Escape}")
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()

    await act(async () => pending.resolve({}))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
  })

  it("renders an error inside the dialog and stays open", async () => {
    const user = userEvent.setup()
    renderDialog({ action: async () => ({ error: "Plex didn't answer." }) })
    const dialog = await open(user)

    await user.click(confirmButton(dialog))

    const alert = await screen.findByRole("alert")
    expect(alert).toHaveTextContent("Plex didn't answer.")
    expect(dialog).toContainElement(alert)
    expect(confirmButton(dialog)).not.toHaveAttribute("aria-busy")
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("shows fixed copy when the action throws", async () => {
    const user = userEvent.setup()
    renderDialog({ action: async () => Promise.reject(new Error("socket hang up")) })
    const dialog = await open(user)
    await user.click(confirmButton(dialog))
    expect(await screen.findByRole("alert")).toHaveTextContent(CONFIRM_FALLBACK_ERROR)
  })

  it("closes on success and returns focus to the trigger", async () => {
    const user = userEvent.setup()
    const action = renderDialog()
    const trigger = screen.getByRole("button", { name: "Remove access" })
    const dialog = await open(user)

    await user.click(confirmButton(dialog))

    expect(action).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("gates confirm on typeToConfirm, ignoring case", async () => {
    const user = userEvent.setup()
    const action = renderDialog({ typeToConfirm: "sam rivera" })
    const dialog = await open(user)
    const input = screen.getByLabelText("Type sam rivera to confirm")

    expect(confirmButton(dialog)).toBeDisabled()
    await user.type(input, "sam")
    expect(confirmButton(dialog)).toBeDisabled()
    await user.type(input, " RIVERA")
    expect(confirmButton(dialog)).toBeEnabled()

    await user.click(confirmButton(dialog))
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("works controlled, without a trigger", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        title="Delete invite?"
        description="The link stops working."
        confirmLabel="Delete"
        cancelLabel="Keep"
        action={async () => ({})}
        data-testid="confirm"
        confirmTestId="confirm-button"
      />
    )
    expect(await screen.findByTestId("confirm")).toHaveAttribute("role", "alertdialog")
    expect(screen.getByTestId("confirm-button")).toHaveClass("bg-primary")

    await user.click(screen.getByRole("button", { name: "Keep" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
