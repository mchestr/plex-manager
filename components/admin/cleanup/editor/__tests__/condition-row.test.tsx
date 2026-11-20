import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import type { RowKit } from "@/components/admin/cleanup/editor/condition-box"
import { ConditionRow, LAST_CONDITION_REASON } from "@/components/admin/cleanup/editor/condition-row"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"

expect.extend(toHaveNoViolations)

const LAST_PLAYED: DraftCondition = {
  id: "c2",
  field: "watch.lastPlayed",
  op: "moreThan",
  value: { duration: { amount: 365, unit: "days" }, orNever: true },
}
const PLAYS: DraftCondition = { id: "p1", field: "watch.plays", op: "atLeast", value: { count: 3, window: { kind: "total" } } }

function kit(overrides: Partial<RowKit> = {}): RowKit {
  return {
    level: "movie",
    words: { memberName: () => null },
    saved: null,
    errors: new Map(),
    held: new Map([["c2", 13]]),
    keeps: new Map([["p1", 7]]),
    failed: new Map(),
    historyStart: "2022-06-14",
    zone: "UTC",
    open: null,
    targets: [
      { id: "c1", sentence: "Added more than 365 days ago" },
      { id: "c2", sentence: "Last played more than 365 days ago, or never" },
    ],
    conditionCount: 3,
    onOpen: jest.fn(),
    onAction: jest.fn(),
    ...overrides,
  }
}

function renderRow(condition = LAST_PLAYED, overrides: Partial<RowKit> = {}, inGroup = false) {
  const k = kit(overrides)
  const user = userEvent.setup()
  const view = render(<ConditionRow condition={condition} position={{ n: 2, total: 3, inGroup }} gutter="and" kit={k} />)
  return { user, kit: k, ...view }
}

const tid = (id: string) => screen.getByTestId(id)

describe("ConditionRow", () => {
  it("is a toolbar named by its sentence, with the gutter word, tokens, held-back text and two buttons", async () => {
    const { container } = renderRow()
    const toolbar = screen.getByRole("toolbar", { name: "Condition 2 of 3: Last played more than 365 days ago, or never." })
    expect(toolbar).toHaveAttribute("data-testid", "admin-cleanup-condition-c2")
    expect(tid("admin-cleanup-condition-c2-field")).toHaveAccessibleName("Last played, field. Change.")
    expect(tid("admin-cleanup-condition-c2-operator")).toHaveAccessibleName("more than, operator. Change.")
    expect(tid("admin-cleanup-condition-c2-value")).toHaveAccessibleName("365 days, value. Change.")
    expect(within(toolbar).getByText("ago, or never")).toBeInTheDocument()
    expect(tid("admin-cleanup-condition-c2-held")).toHaveTextContent("13 more without it")
    expect(tid("admin-cleanup-condition-c2-menu")).toHaveAccessibleName("More actions for this condition")
    expect(tid("admin-cleanup-condition-c2-remove")).toHaveAccessibleName("Remove condition")
    expect(tid("admin-cleanup-condition-c2-help")).toHaveTextContent("Never means no counted play since Tautulli history starts on Jun 14, 2022.")
    expect(toolbar).toHaveAccessibleDescription("Never means no counted play since Tautulli history starts on Jun 14, 2022.")
    expect(within(toolbar).getAllByText("and")[0]).toHaveAttribute("aria-hidden", "true")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("is one tab stop with roving tabindex: Left, Right, Home and End move between the parts", async () => {
    const { user } = renderRow()
    const stops = ["field", "operator", "value", "menu", "remove"].map((part) => tid(`admin-cleanup-condition-c2-${part}`))
    expect(stops.map((s) => s.tabIndex)).toEqual([0, -1, -1, -1, -1])
    await user.tab()
    expect(stops[0]).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(stops[1]).toHaveFocus()
    expect(stops.map((s) => s.tabIndex)).toEqual([-1, 0, -1, -1, -1])
    await user.keyboard("{End}")
    expect(stops[4]).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(stops[4]).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(stops[3]).toHaveFocus()
    await user.keyboard("{Home}")
    expect(stops[0]).toHaveFocus()
    await user.keyboard("{ArrowLeft}")
    expect(stops[0]).toHaveFocus()
    // Tab leaves the row from its one stop (jsdom shows the phone box too: it is the next stop)
    await user.tab()
    expect(tid("admin-cleanup-condition-c2-box")).toHaveFocus()
  })

  it("opens the editor at the pressed part: a press, Enter, Space and Down", async () => {
    const { user, kit } = renderRow()
    await user.click(tid("admin-cleanup-condition-c2-operator"))
    expect(kit.onOpen).toHaveBeenLastCalledWith("c2", "operator")
    act(() => tid("admin-cleanup-condition-c2-value").focus())
    await user.keyboard("{Enter}")
    expect(kit.onOpen).toHaveBeenLastCalledWith("c2", "value")
    act(() => tid("admin-cleanup-condition-c2-field").focus())
    await user.keyboard(" ")
    expect(kit.onOpen).toHaveBeenLastCalledWith("c2", "field")
    act(() => tid("admin-cleanup-condition-c2-operator").focus())
    await user.keyboard("{ArrowDown}")
    expect(kit.onOpen).toHaveBeenLastCalledWith("c2", "operator")
    await user.click(tid("admin-cleanup-condition-c2-box"))
    expect(kit.onOpen).toHaveBeenLastCalledWith("c2", "box")
  })

  it("removes the row with Delete or Backspace on a token, or the remove button", async () => {
    const { user, kit } = renderRow()
    act(() => tid("admin-cleanup-condition-c2-value").focus())
    await user.keyboard("{Delete}")
    expect(kit.onAction).toHaveBeenLastCalledWith({ type: "remove", id: "c2" })
    act(() => tid("admin-cleanup-condition-c2-field").focus())
    await user.keyboard("{Backspace}")
    expect(kit.onAction).toHaveBeenCalledTimes(2)
    // Not on a button
    act(() => tid("admin-cleanup-condition-c2-menu").focus())
    await user.keyboard("{Delete}")
    expect(kit.onAction).toHaveBeenCalledTimes(2)
    await user.click(tid("admin-cleanup-condition-c2-remove"))
    expect(kit.onAction).toHaveBeenLastCalledWith({ type: "remove", id: "c2" })
  })

  it("keeps the last condition's remove button focusable and named, with its reason", async () => {
    const { user, kit } = renderRow(LAST_PLAYED, { conditionCount: 1 })
    const remove = tid("admin-cleanup-condition-c2-remove")
    expect(remove).toHaveAccessibleName("Remove condition")
    expect(remove).toHaveAttribute("aria-disabled", "true")
    expect(remove).toHaveAccessibleDescription(LAST_CONDITION_REASON)
    act(() => tid("admin-cleanup-condition-c2-field").focus())
    await user.keyboard("{End}")
    expect(remove).toHaveFocus()
    await user.click(remove)
    expect(kit.onAction).not.toHaveBeenCalled()
  })

  it("names a protection row and shows keeps N safe", () => {
    render(<ConditionRow condition={PLAYS} position={{ n: 1, total: 1 }} gutter={null} kit={kit()} />)
    expect(screen.getByRole("toolbar", { name: "Protection 1 of 1: Plays at least 3 in total." })).toHaveAttribute(
      "data-testid",
      "admin-cleanup-protection-p1"
    )
    expect(tid("admin-cleanup-protection-p1-held")).toHaveTextContent("keeps 7 safe")
    expect(tid("admin-cleanup-protection-p1-remove")).toHaveAccessibleName("Remove protection")
    expect(tid("admin-cleanup-protection-p1-menu")).toHaveAccessibleName("More actions for this protection")
    expect(tid("admin-cleanup-protection-p1-box")).toHaveAccessibleName("Plays at least 3 in total. Keeps 7 safe. Change protection 1 of 1.")
  })

  it("offers the menu of its kind: group with for a condition, move out in a group, turn into a condition on a protection", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const { unmount } = render(<ConditionRow condition={LAST_PLAYED} position={{ n: 2, total: 3 }} gutter="and" kit={kit()} />)
    await user.click(tid("admin-cleanup-condition-c2-menu"))
    expect(await screen.findByTestId("admin-cleanup-condition-c2-menu-group")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-condition-c2-menu-protection")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-condition-c2-menu-remove")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-condition-c2-menu-ungroup")).toBeNull()
    await user.keyboard("{Escape}")
    unmount()

    render(<ConditionRow condition={LAST_PLAYED} position={{ n: 2, total: 3, inGroup: true }} gutter="or" kit={kit()} />)
    await user.click(tid("admin-cleanup-condition-c2-menu"))
    expect(await screen.findByTestId("admin-cleanup-condition-c2-menu-ungroup")).toHaveTextContent("Move out of the group")
    expect(screen.queryByTestId("admin-cleanup-condition-c2-menu-group")).toBeNull()
    expect(screen.getByRole("toolbar")).toHaveAccessibleName("Condition 2 of 3 in the any-of group: Last played more than 365 days ago, or never.")
    // Arrow keys inside the open menu do not move the row's roving stop
    await user.keyboard("{ArrowRight}")
    expect(tid("admin-cleanup-condition-c2-menu").tabIndex).toBe(0)
    expect(tid("admin-cleanup-condition-c2-remove").tabIndex).toBe(-1)
  })

  it("marks the token states: open, changed since save, error, incomplete and not applicable", () => {
    const saved = { schemaVersion: 1 as const, level: "movie" as const, libraries: [], conditions: [{ ...LAST_PLAYED, op: "lessThan" }], protections: [], then: {} }
    const { rerender } = renderRow(LAST_PLAYED, { saved, open: { id: "c2", anchor: "value" } })
    expect(tid("admin-cleanup-condition-c2-value")).toHaveAttribute("data-state", "open")
    expect(tid("admin-cleanup-condition-c2-operator")).toHaveAttribute("data-state", "changed")
    expect(tid("admin-cleanup-condition-c2-operator")).toHaveAccessibleName("more than, operator, changed. Change.")
    expect(tid("admin-cleanup-condition-c2-field")).toHaveAttribute("data-state", "default")

    rerender(<ConditionRow condition={LAST_PLAYED} position={{ n: 2, total: 3 }} gutter="and" kit={kit({ errors: new Map([["c2", "Enter a whole number."]]) })} />)
    expect(tid("admin-cleanup-condition-c2-value")).toHaveAttribute("data-state", "error")
    expect(tid("admin-cleanup-condition-c2-value")).toHaveAccessibleDescription("Enter a whole number.")
    expect(tid("admin-cleanup-condition-c2-box-value")).toHaveAttribute("data-look", "error")

    const size: DraftCondition = { id: "c3", field: "file.size", op: "moreThan", value: {} }
    rerender(<ConditionRow condition={size} position={{ n: 3, total: 3 }} gutter="and" kit={kit()} />)
    expect(tid("admin-cleanup-condition-c3-value")).toHaveTextContent("Enter a size")
    expect(tid("admin-cleanup-condition-c3-value")).toHaveAttribute("data-state", "incomplete")
    expect(tid("admin-cleanup-condition-c3-held")).toHaveTextContent("Not used until complete.")
    expect(tid("admin-cleanup-condition-c3-box")).toHaveAccessibleName("Size more than Enter a size. Not used until complete. Change condition 3 of 3.")

    const status: DraftCondition = { id: "c4", field: "show.status", op: "is", value: { status: "ended" } }
    rerender(<ConditionRow condition={status} position={{ n: 3, total: 3 }} gutter="and" kit={kit()} />)
    expect(tid("admin-cleanup-condition-c4-field")).toHaveAttribute("data-state", "notApplicable")
    expect(tid("admin-cleanup-condition-c4-value")).toHaveAttribute("data-state", "notApplicable")
    expect(tid("admin-cleanup-condition-c4-value")).toHaveAccessibleDescription("Show status does not apply to movies. Remove it, or change the level back.")
  })
})
