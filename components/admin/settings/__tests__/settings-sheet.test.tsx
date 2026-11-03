/**
 * The Sheet around a list row's form. A Sheet's unsaved changes are its
 * section's: reported to the settings page when there is one, and on a page of
 * its own (the AI settings tab) guarded by the Sheet itself, since a reload
 * would otherwise throw the draft away without asking.
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { leaveIsGuarded } from "@/__tests__/helpers/leave-guard"
import { SettingsSheet } from "@/components/admin/settings/settings-sheet"
import { SheetForm, type SheetFormControls } from "@/components/admin/settings/sheet-form"
import { SettingsEditProvider } from "@/components/ui/settings-edit-context"
import type { SettingsFormState } from "@/hooks/admin/use-settings-form"

/** A form backed by real state, so dirtiness follows typing. */
function NameForm(controls: Required<SheetFormControls>) {
  const [name, setName] = useState("Memini")
  const form: SettingsFormState = { isDirty: name !== "Memini", isPending: false, onDiscard: () => setName("Memini"), onSave: async () => true }
  return (
    <SheetForm form={form} data-testid="memini-form" {...controls}>
      <input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
    </SheetForm>
  )
}

function Row() {
  return (
    <SettingsSheet
      section="assistant"
      id="memini"
      name="Memini"
      title="Memini"
      trigger="Edit"
      triggerLabel="Memini"
      triggerTestId="memini-edit"
      sheetTestId="memini-sheet"
    >
      {(controls) => <NameForm {...controls} />}
    </SettingsSheet>
  )
}

describe("SettingsSheet unsaved changes", () => {
  it("stand-alone, asks the browser before the tab closes only while the open Sheet has unsaved changes", async () => {
    const user = userEvent.setup()
    render(<Row />)
    expect(leaveIsGuarded()).toBe(false)

    await user.click(screen.getByTestId("memini-edit"))
    expect(screen.getByTestId("memini-sheet")).toBeInTheDocument()
    expect(leaveIsGuarded()).toBe(false)

    await user.type(screen.getByRole("textbox", { name: "Name" }), " 2")
    expect(leaveIsGuarded()).toBe(true)

    await user.keyboard("{Escape}")
    await user.click(await screen.findByTestId("settings-memini-discard-dialog-confirm"))
    await waitFor(() => expect(screen.queryByTestId("memini-sheet")).not.toBeInTheDocument())
    expect(leaveIsGuarded()).toBe(false)
  })

  it("inside the settings page provider, reports to the page and leaves the one listener to its layout", async () => {
    const user = userEvent.setup()
    const onDirtyChange = jest.fn()
    render(
      <SettingsEditProvider onDirtyChange={onDirtyChange}>
        <Row />
      </SettingsEditProvider>
    )

    await user.click(screen.getByTestId("memini-edit"))
    await user.type(screen.getByRole("textbox", { name: "Name" }), " 2")

    expect(onDirtyChange).toHaveBeenLastCalledWith("assistant", true)
    expect(leaveIsGuarded()).toBe(false)
  })
})
