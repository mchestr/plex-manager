import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

expect.extend(toHaveNoViolations)

function Example({ onDelete = jest.fn() }: { onDelete?: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>Delete invite</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete the invite for Sam Rivera?</AlertDialogTitle>
          <AlertDialogDescription>The link stops working straight away.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel />
          <AlertDialogAction onClick={onDelete}>Delete invite</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

describe("AlertDialog", () => {
  it("is an alertdialog with a destructive-solid confirm and no Close button", async () => {
    const user = userEvent.setup()
    render(<Example />)
    await user.click(screen.getByRole("button", { name: "Delete invite" }))

    const dialog = await screen.findByRole("alertdialog", { name: "Delete the invite for Sam Rivera?" })
    expect(dialog).toHaveAccessibleDescription("The link stops working straight away.")
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
    const confirm = screen.getAllByRole("button", { name: "Delete invite" }).find((b) => dialog.contains(b))
    expect(confirm).toHaveClass("bg-destructive", "text-destructive-foreground")
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("Cancel closes it and returns focus to the trigger", async () => {
    const user = userEvent.setup()
    render(<Example />)
    const trigger = screen.getByRole("button", { name: "Delete invite" })
    await user.click(trigger)
    await user.click(await screen.findByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
