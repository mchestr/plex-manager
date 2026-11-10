import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"

import { calls, FOCUS, Harness, id, LAST_PLAYED, number, openEditor, token, useViewport, viewport } from "./editor-harness"

expect.extend(toHaveNoViolations)

useViewport()

const { onDraftChange, onDone, onCancel, onRemove } = calls

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockClear()
})

describe("ConditionEditor in the Popover", () => {
  it("shows the caption, title, field, operator, value, presets, computed line, or never, histogram and count", async () => {
    const { editor } = await openEditor()
    expect(editor).toHaveAttribute("data-shell", "popover")
    expect(editor).toHaveAccessibleName("Condition 2 of 3 Last played")
    expect(within(editor).getByText("The newest counted play by anyone, from Tautulli. A play counts after 2 minutes or 90 %.")).toBeVisible()
    expect(screen.getByTestId(id("field"))).toHaveAccessibleName("Field Last played")
    expect(screen.getByRole("radiogroup", { name: "Operator" })).toBeInTheDocument()
    expect(screen.getByTestId(id("operator-more-than"))).toHaveAttribute("aria-checked", "true")
    expect(number()).toHaveValue("365")
    expect(screen.getByTestId(id("unit"))).toHaveTextContent("days")
    expect(screen.getByTestId(id("preset-365-days"))).toHaveAttribute("aria-checked", "true")
    expect(screen.getByTestId(id("preset-180-days"))).toHaveAccessibleName("180 days, 231 matches")
    expect(within(editor).getByText("Played before Nov 8, 2025, server time (UTC).")).toBeVisible()
    expect(screen.getByTestId(id("never"))).toHaveAttribute("aria-checked", "true")
    expect(screen.getByTestId(id("never"))).toHaveAccessibleDescription(
      "Never means no counted play since Tautulli history starts on Jun 14, 2022."
    )
    expect(within(screen.getByTestId(id("histogram"))).getByText("Movies by last play")).toBeVisible()
    expect(screen.getByText("478 of 777 movies pass this condition.")).toBeVisible()
    expect(screen.getByTestId(id("count"))).toHaveTextContent("With this value: 197 matches")
    expect(screen.getByTestId(id("count"))).toHaveAttribute("aria-live", "polite")
    expect(screen.getByTestId(id("cancel"))).toHaveTextContent("Cancel")
    expect(screen.queryByTestId(id("remove"))).toBeNull()
    expect(await axe(document.body)).toHaveNoViolations()
  })

  it("puts focus in the value input, and Enter there applies the typed value, as Done", async () => {
    const { user } = await openEditor()
    await waitFor(() => expect(number()).toHaveFocus())
    await user.clear(number())
    await user.type(number(), "180{Enter}")
    expect(onDone).toHaveBeenCalledWith({ ...LAST_PLAYED, value: { duration: { amount: 180, unit: "days" }, orNever: true } })
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-condition-editor")).toBeNull())
    await waitFor(() => expect(token()).toHaveFocus())
  })

  it("sends typed numbers 500 ms after the last key, and chips at once", async () => {
    const { user } = await openEditor()
    await user.clear(number())
    await user.type(number(), "200")
    expect(onDraftChange).not.toHaveBeenCalled()
    await waitFor(() => expect(onDraftChange).toHaveBeenCalledTimes(1), { timeout: 1500 })
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: { duration: { amount: 200, unit: "days" }, orNever: true } }))

    await user.click(screen.getByTestId(id("preset-2-years")))
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: { duration: { amount: 2, unit: "years" }, orNever: true } }))
    expect(screen.getByTestId(id("unit"))).toHaveTextContent("years")
    expect(number()).toHaveValue("2")
  })

  it("Done applies the local copy; the operator and or never change it at once", async () => {
    const { user } = await openEditor()
    await user.click(screen.getByTestId(id("never")))
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: expect.objectContaining({ orNever: false }) }))
    await user.click(screen.getByTestId(id("operator-less-than")))
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ op: "lessThan" }))
    expect(screen.queryByTestId(id("never"))).toBeNull()

    await user.click(screen.getByTestId(id("done")))
    expect(onDone).toHaveBeenCalledWith({ ...LAST_PLAYED, op: "lessThan", value: { duration: { amount: 365, unit: "days" }, orNever: false } })
  })

  it("hides the value for Never and keeps the row complete", async () => {
    const { user } = await openEditor()
    await user.clear(number())
    await user.click(screen.getByTestId(id("operator-never")))
    expect(screen.queryByTestId(id("number"))).toBeNull()
    expect(screen.queryByText("Value")).toBeNull()
    expect(screen.getByTestId(id("histogram"))).toBeInTheDocument()
    await user.click(screen.getByTestId(id("done")))
    expect(onDone).toHaveBeenCalledWith({ ...LAST_PLAYED, op: "never" })
  })

  it("Cancel and Esc restore the value from before, and return focus to the token", async () => {
    const { user } = await openEditor()
    await user.click(screen.getByTestId(id("preset-90-days")))
    await user.click(screen.getByTestId(id("cancel")))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onDone).not.toHaveBeenCalled()
    await waitFor(() => expect(token()).toHaveFocus())

    await user.click(token())
    await screen.findByTestId("admin-cleanup-condition-editor")
    expect(screen.getByTestId(id("preset-365-days"))).toHaveAttribute("aria-checked", "true")
    await user.clear(number())
    await user.type(number(), "7")
    await user.keyboard("{Escape}")
    expect(onCancel).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(token()).toHaveFocus())
    // Nothing typed reaches the preview after a cancel.
    await act(() => new Promise((resolve) => setTimeout(resolve, 600)))
    expect(onDraftChange).toHaveBeenCalledTimes(1)
  })

  it("keeps the editor open with the X4 message for an invalid value, on Done, Enter, blur and an outside press", async () => {
    const { user } = await openEditor()
    await user.clear(number())
    await user.click(screen.getByTestId(id("done")))
    const error = await screen.findByTestId(id("error"))
    expect(error).toHaveTextContent("Enter a whole number of days from 1 to 3650.")
    expect(onDone).not.toHaveBeenCalled()
    // The computed date of the last valid value goes.
    expect(screen.queryByText("Played before Nov 8, 2025, server time (UTC).")).toBeNull()
    await waitFor(() => expect(number()).toHaveFocus())
    expect(number()).toHaveAttribute("aria-invalid", "true")
    expect(number()).toHaveAccessibleDescription("Enter a whole number of days from 1 to 3650.")

    await user.click(document.body)
    expect(screen.getByTestId("admin-cleanup-condition-editor")).toBeInTheDocument()
    expect(onDone).not.toHaveBeenCalled()

    // A valid key clears the message before blur.
    await user.type(number(), "30")
    expect(screen.queryByTestId(id("error"))).toBeNull()
    await user.click(document.body)
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ value: { duration: { amount: 30, unit: "days" }, orNever: true } })))
  })

  it("names the chosen unit in the error when the amount does not fit it (X4)", async () => {
    const { user } = await openEditor()
    await user.click(screen.getByTestId(id("unit")))
    await user.click(await screen.findByTestId(id("unit-option-years")))
    expect(await screen.findByTestId(id("error"))).toHaveTextContent("Enter a whole number of years from 1 to 10.")
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ value: { duration: { amount: 365, unit: "years" }, orNever: true } }))
    await user.click(screen.getByTestId(id("done")))
    expect(onDone).not.toHaveBeenCalled()
  })

  it("applies on Tab from Done and moves on, but stays on the error with an invalid value", async () => {
    const { user } = await openEditor()
    act(() => screen.getByTestId(id("done")).focus())
    await user.tab()
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Add condition" })).toHaveFocus()

    await user.click(token())
    await screen.findByTestId("admin-cleanup-condition-editor")
    await user.clear(number())
    act(() => screen.getByTestId(id("done")).focus())
    await user.tab()
    await waitFor(() => expect(number()).toHaveFocus())
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId(id("error"))).toBeInTheDocument()
  })

  it("says the count in the singular, and nothing before a preview settles", async () => {
    const { rerender } = render(<Harness focus={{ ...FOCUS, matches: 1 }} />)
    await userEvent.setup().click(token())
    expect(await screen.findByTestId(id("count"))).toHaveTextContent("With this value: 1 match")
    rerender(<Harness focus={{ matches: null }} />)
    expect(screen.getByTestId(id("count"))).toBeEmptyDOMElement()
    expect(screen.queryByTestId(id("histogram"))).toBeNull()
    expect(screen.getByTestId(id("preset-180-days"))).toHaveAccessibleName("180 days")
  })
})

describe("ConditionEditor focus", () => {
  it.each([
    ["operator", LAST_PLAYED, () => screen.getByTestId(id("operator-more-than"))],
    ["field", LAST_PLAYED, () => screen.getByTestId(id("field"))],
    ["fieldSearch", LAST_PLAYED, () => screen.getByTestId(id("field-search"))],
    ["radio", { id: "c2", field: "request.exists", op: "is", value: { exists: false } }, () => screen.getByTestId(id("choice-no"))],
    ["combobox", { id: "c2", field: "request.by", op: "only", value: { requesters: [{ kind: "former" }] } }, () => screen.getByTestId(id("list"))],
    // A value focus falls back to the operator when the operator has no value (UX 4.3.8 item 2.2).
    ["value", { ...LAST_PLAYED, op: "never" }, () => screen.getByTestId(id("operator-never"))],
  ] as const)("puts focus on the %s part", async (focusPart, condition, target) => {
    await openEditor({ focusPart, condition })
    await waitFor(() => expect(target()).toHaveFocus())
  })
})

describe("ConditionEditor in the phone Sheet", () => {
  beforeEach(() => {
    viewport.wide = false
  })

  it("holds Remove condition and Done at 44 px, speaks the count, and the Close button cancels", async () => {
    const { user, editor } = await openEditor({ headerActions: <Button aria-label="More actions for this condition">...</Button> })
    expect(editor).toHaveAttribute("data-shell", "sheet")
    // The Sheet puts focus in the value input too (UX 4.3.8 item 2.2).
    await waitFor(() => expect(number()).toHaveFocus())
    expect(within(editor).getByRole("button", { name: "More actions for this condition" })).toBeInTheDocument()
    expect(screen.getByTestId(id("remove"))).toHaveClass("h-11")
    expect(screen.getByTestId(id("done"))).toHaveClass("h-11")
    expect(screen.getByTestId(id("count"))).toHaveClass("sr-only")
    expect(screen.queryByTestId(id("cancel"))).toBeNull()

    await user.click(screen.getByTestId(id("close")))
    expect(onCancel).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(token()).toHaveFocus())

    await user.click(token())
    await user.click(await screen.findByTestId(id("remove")))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it("keeps Remove focusable but disabled, with its reason, on a rule's only condition", async () => {
    const { user } = await openEditor({ index: 1, total: 1 })
    const remove = screen.getByTestId(id("remove"))
    expect(remove).toHaveAttribute("aria-disabled", "true")
    expect(remove).toHaveAccessibleDescription("A rule needs at least one condition")
    act(() => remove.focus())
    expect(remove).toHaveFocus()
    await user.click(remove)
    expect(onRemove).not.toHaveBeenCalled()
  })

  it("names a protection and lets its only one go", async () => {
    const { editor } = await openEditor({ conditionRole: "protection", index: 1, total: 1 })
    expect(editor).toHaveAccessibleName("Protection 1 of 1 Last played")
    expect(screen.getByTestId(id("remove"))).toHaveTextContent("Remove protection")
    expect(screen.getByTestId(id("remove"))).not.toHaveAttribute("aria-disabled", "true")
  })
})
