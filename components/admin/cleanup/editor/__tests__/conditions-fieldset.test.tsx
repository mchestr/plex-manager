import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useReducer } from "react"

import type { RowKit } from "@/components/admin/cleanup/editor/condition-box"
import { ConditionsFieldset, undoPlace } from "@/components/admin/cleanup/editor/conditions-fieldset"
import { draftReducer, initDraftState, type UndoRecord } from "@/lib/cleanup/editor/draft"
import { flatConditions, isGroup } from "@/lib/cleanup/editor/tree"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

expect.extend(toHaveNoViolations)

const DRAFT: RuleDraft = {
  schemaVersion: 1,
  level: "movie",
  libraries: ["1"],
  conditions: [
    { id: "c1", field: "library.added", op: "moreThan", value: { duration: { amount: 365, unit: "days" } } },
    { id: "c2", field: "watch.lastPlayed", op: "moreThan", value: { duration: { amount: 365, unit: "days" }, orNever: true } },
    {
      id: "a1",
      kind: "anyOf",
      conditions: [
        { id: "c3", field: "request.exists", op: "is", value: { exists: false } },
        { id: "c4", field: "request.by", op: "only", value: { requesters: [{ kind: "former" }] } },
      ],
    },
  ],
  protections: [],
  then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
}

function kitFor(draft: RuleDraft, onAction: RowKit["onAction"]): RowKit {
  return {
    level: draft.level,
    words: { memberName: () => null },
    saved: null,
    errors: new Map(),
    held: new Map(),
    keeps: new Map(),
    failed: new Map(),
    historyStart: null,
    zone: "UTC",
    open: null,
    targets: draft.conditions.flatMap((c) => (isGroup(c) ? [] : [{ id: c.id, sentence: c.field }])),
    conditionCount: flatConditions(draft.conditions).length,
    onOpen: jest.fn(),
    onAction,
  }
}

/** The fieldset over the real draft reducer. */
function Live({ start = DRAFT }: { start?: RuleDraft }) {
  const [state, dispatch] = useReducer(draftReducer, initDraftState(start, "Old films"))
  return <ConditionsFieldset clauses={state.draft.conditions} kit={kitFor(state.draft, dispatch)} undo={state.undo} />
}

/**
 * Picks a target of the group-with submenu by keyboard, as a pointer pick
 * races Base UI's guard against a release on an item that just opened.
 */
async function pickGroupTarget(user: ReturnType<typeof userEvent.setup>, triggerId: string, index: number) {
  act(() => screen.getByTestId(triggerId).focus())
  await user.keyboard("{Enter}")
  await screen.findByTestId(`${triggerId}-duplicate`)
  await user.keyboard("{ArrowDown}{ArrowRight}")
  await screen.findByText("Group with")
  await user.keyboard(`${"{ArrowDown}".repeat(index)}{Enter}`)
}

const tid = (id: string) => screen.getByTestId(id)
const rowOrder = () => Array.from(document.querySelectorAll('[data-slot="condition-row"], [data-testid^="admin-cleanup-undo-"]:not([data-testid$="-button"])'), (el) => el.getAttribute("data-row") ?? el.getAttribute("data-testid"))

describe("ConditionsFieldset", () => {
  it("names the part by the level, with the notes, the rows and groups joined with and, and the add buttons", async () => {
    const { container } = render(<Live />)
    const part = screen.getByRole("group", { name: "Find movies where all of these are true" })
    expect(part).toHaveAccessibleDescription("Select a condition to change it. Order does not matter.")
    expect(rowOrder()).toEqual(["c1", "c2", "c3", "c4"])
    expect(within(tid("admin-cleanup-condition-c1")).queryByText("and")).toBeNull()
    expect(within(tid("admin-cleanup-condition-c2")).getByText("and")).toBeInTheDocument()
    expect(tid("admin-cleanup-add-condition").className).toContain("max-md:h-11")
    expect(tid("admin-cleanup-add-group")).toHaveTextContent("Add an any-of group")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("follows the level in its legend", () => {
    render(<Live start={{ ...DRAFT, level: "season" }} />)
    expect(screen.getByRole("group", { name: "Find seasons where all of these are true" })).toBeInTheDocument()
  })

  it("adds a condition and an any-of group", async () => {
    const user = userEvent.setup()
    render(<Live />)
    await user.click(tid("admin-cleanup-add-condition"))
    expect(tid("admin-cleanup-condition-c5")).toHaveAccessibleName("Condition 5 of 5: Added more than 90 days ago.")
    await user.click(tid("admin-cleanup-add-group"))
    expect(within(tid("admin-cleanup-group-a2")).getAllByRole("toolbar")).toHaveLength(2)
    expect(rowOrder()).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7"])
  })

  it("puts the Undo line in place of a removed row, in its group, and after the last row", async () => {
    const user = userEvent.setup()
    render(<Live />)
    await user.click(tid("admin-cleanup-condition-c2-remove"))
    expect(rowOrder()).toEqual(["c1", "admin-cleanup-undo-c2", "c3", "c4"])
    await user.click(tid("admin-cleanup-undo-c2-button"))
    expect(rowOrder()).toEqual(["c1", "c2", "c3", "c4"])

    await user.click(tid("admin-cleanup-condition-c3-remove"))
    expect(within(tid("admin-cleanup-group-a1")).getByTestId("admin-cleanup-undo-c3")).toHaveTextContent("Condition removed: Requested in Overseerr: no.")
    expect(tid("admin-cleanup-group-a1-notice")).toBeInTheDocument()
    await user.click(tid("admin-cleanup-undo-c3-button"))

    await user.click(tid("admin-cleanup-group-a1-remove"))
    expect(rowOrder()).toEqual(["c1", "c2", "admin-cleanup-undo-a1"])
    expect(tid("admin-cleanup-undo-a1")).toHaveTextContent("Any-of group removed: Requested in Overseerr: no, or Requested by only former members.")
  })

  it("keeps the last condition: its remove is refused", async () => {
    const user = userEvent.setup()
    render(<Live start={{ ...DRAFT, conditions: [DRAFT.conditions[0]] }} />)
    expect(tid("admin-cleanup-condition-c1-remove")).toHaveAttribute("aria-disabled", "true")
    await user.click(tid("admin-cleanup-condition-c1-remove"))
    expect(tid("admin-cleanup-condition-c1")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-undo-c1")).toBeNull()
  })

  it("moves rows into a group and out again, and ungroups", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Live />)
    await pickGroupTarget(user, "admin-cleanup-condition-c1-menu", 0)
    expect(within(tid("admin-cleanup-group-a2")).getAllByRole("toolbar").map((t) => t.getAttribute("data-testid"))).toEqual([
      "admin-cleanup-condition-c1",
      "admin-cleanup-condition-c2",
    ])
    await user.click(tid("admin-cleanup-condition-c2-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-condition-c2-menu-ungroup"))
    expect(rowOrder()).toEqual(["c1", "c2", "c3", "c4"])
    expect(tid("admin-cleanup-group-a2-notice")).toBeInTheDocument()
    await user.click(tid("admin-cleanup-group-a1-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-group-a1-menu-ungroup"))
    expect(screen.queryByTestId("admin-cleanup-group-a1")).toBeNull()
    expect(screen.getByRole("toolbar", { name: /^Condition 3 of 4: Requested in Overseerr: no\.$/ })).toBeInTheDocument()
  })

  it("disables the add buttons at the limit of 20 clauses", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...DRAFT.conditions[0], id: `c${i + 1}` }))
    render(<Live start={{ ...DRAFT, conditions: many }} />)
    expect(tid("admin-cleanup-add-condition")).toBeDisabled()
    expect(tid("admin-cleanup-add-group")).toBeDisabled()
  })
})

describe("undoPlace", () => {
  const record = (removed: UndoRecord["removed"], before = DRAFT.conditions): UndoRecord => ({
    removed,
    list: "conditions",
    before: { conditions: before, protections: [] },
  })

  it("places a top-level removal at its index, and a member inside its group while the group stays", () => {
    const after = DRAFT.conditions.filter((c) => c.id !== "c2")
    expect(undoPlace(record(DRAFT.conditions[1]), after)).toEqual({ at: 1 })
    const group = DRAFT.conditions[2]
    if (!isGroup(group)) throw new Error("group")
    expect(undoPlace(record(group.conditions[1]), DRAFT.conditions)).toEqual({ at: 1, group: "a1" })
    expect(undoPlace(record(group.conditions[1]), DRAFT.conditions.slice(0, 2))).toEqual({ at: 2 })
    expect(undoPlace(record({ ...DRAFT.conditions[0], id: "c9" }), DRAFT.conditions)).toBeNull()
  })
})
