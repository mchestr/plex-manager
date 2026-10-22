/**
 * SubmitButton (P10.7): inside a `<form action>`, `useFormStatus` drives
 * Button's loading state while the action runs.
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { SubmitButton } from "@/components/ui/submit-button"

describe("SubmitButton", () => {
  it("is a submit button that is idle before the form is sent", () => {
    render(
      <form action={async () => undefined}>
        <SubmitButton loadingLabel="Saving">Save</SubmitButton>
      </form>
    )

    const button = screen.getByRole("button", { name: "Save" })
    expect(button).toHaveAttribute("type", "submit")
    expect(button).not.toHaveAttribute("aria-busy")
    expect(button).toBeEnabled()
  })

  it("shows the loading label while the form action runs, then returns", async () => {
    const user = userEvent.setup()
    let finish: () => void = () => undefined
    const action = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    render(
      <form action={action}>
        <SubmitButton loadingLabel="Saving">Save</SubmitButton>
      </form>
    )

    await user.click(screen.getByRole("button", { name: "Save" }))

    const button = screen.getByRole("button")
    await waitFor(() => expect(button).toHaveAttribute("aria-busy", "true"))
    expect(button).toHaveAccessibleName("Saving")
    expect(action).toHaveBeenCalledTimes(1)

    finish()
    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"))
    expect(button).toHaveAccessibleName("Save")
  })
})
