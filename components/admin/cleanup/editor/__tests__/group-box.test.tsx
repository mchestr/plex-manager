import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import type { RowKit } from "@/components/admin/cleanup/editor/condition-box"
import { GroupBox, ONE_CONDITION_NOTICE } from "@/components/admin/cleanup/editor/group-box"
import type { DraftGroup } from "@/lib/validations/cleanup-draft"

expect.extend(toHaveNoViolations)

const GROUP: DraftGroup = {
  id: "a1",
  kind: "anyOf",
  conditions: [
    { id: "c3", field: "request.exists", op: "is", value: { exists: false } },
    { id: "c4", field: "request.by", op: "only", value: { requesters: [{ kind: "former" }] } },
  ],
}

function kit(overrides: Partial<RowKit> = {}): RowKit {
  return {
    level: "movie",
    words: { memberName: () => null },
    saved: null,
    errors: new Map(),
    held: new Map([["a1", 6]]),
    keeps: new Map(),
    failed: new Map(),
    historyStart: null,
    zone: "UTC",
    open: null,
    targets: [],
    conditionCount: 4,
    onOpen: jest.fn(),
    onAction: jest.fn(),
    ...overrides,
  }
}

const tid = (id: string) => screen.getByTestId(id)

describe("GroupBox", () => {
  it("is a group named by its size, with the header, held-back text, rows joined with or, and Add to this group", async () => {
    const { container } = render(<GroupBox group={GROUP} first={3} kit={kit()} gutter="and" />)
    const group = screen.getByRole("group", { name: "Any of these, 2 conditions. One of them must be true." })
    expect(group).toHaveAttribute("data-testid", "admin-cleanup-group-a1")
    expect(group).toHaveTextContent("Any of these is true (at least 1 of 2)")
    expect(tid("admin-cleanup-group-a1-held")).toHaveTextContent("6 more without it")
    expect(within(group).getByRole("toolbar", { name: /^Condition 3 of 4 in the any-of group: Requested in Overseerr: no\.$/ })).toBeInTheDocument()
    expect(within(group).getByRole("toolbar", { name: /^Condition 4 of 4 in the any-of group: Requested by only former members\.$/ })).toBeInTheDocument()
    expect(within(tid("admin-cleanup-condition-c4")).getByText("or")).toHaveAttribute("aria-hidden", "true")
    expect(screen.queryByTestId("admin-cleanup-condition-c3-held")).toBeNull()
    expect(screen.queryByTestId("admin-cleanup-group-a1-notice")).toBeNull()
    expect(tid("admin-cleanup-group-a1-add")).toHaveTextContent("Add to this group")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("sends add, ungroup, remove group and the remove button", async () => {
    const k = kit()
    const user = userEvent.setup()
    render(<GroupBox group={GROUP} first={3} kit={k} gutter={null} />)
    await user.click(tid("admin-cleanup-group-a1-add"))
    expect(k.onAction).toHaveBeenLastCalledWith({ type: "addToGroup", groupId: "a1" })
    await user.click(tid("admin-cleanup-group-a1-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-group-a1-menu-ungroup"))
    expect(k.onAction).toHaveBeenLastCalledWith({ type: "ungroup", groupId: "a1" })
    await user.click(tid("admin-cleanup-group-a1-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-group-a1-menu-remove"))
    expect(k.onAction).toHaveBeenLastCalledWith({ type: "remove", id: "a1" })
    expect(tid("admin-cleanup-group-a1-remove")).toHaveAccessibleName("Remove group")
    await user.click(tid("admin-cleanup-group-a1-remove"))
    expect(k.onAction).toHaveBeenCalledTimes(4)
  })

  it("shows the notice with one condition, and a save error in its place", () => {
    const one = { ...GROUP, conditions: [GROUP.conditions[0]] }
    const { rerender } = render(<GroupBox group={one} first={1} kit={kit()} gutter={null} />)
    expect(screen.getByRole("group")).toHaveAccessibleName("Any of these, 1 condition. One of them must be true.")
    expect(screen.getByRole("group")).toHaveTextContent("Any of these is true (1 condition)")
    expect(tid("admin-cleanup-group-a1-notice")).toHaveTextContent(ONE_CONDITION_NOTICE)
    rerender(<GroupBox group={one} first={1} kit={kit({ errors: new Map([["a1", "Add a second condition, or remove the group."]]) })} gutter={null} />)
    expect(tid("admin-cleanup-group-a1-notice")).toHaveTextContent("Add a second condition, or remove the group.")
    expect(tid("admin-cleanup-group-a1-notice").className).toContain("text-destructive")
  })

  it("keeps the remove button focusable but refused when the group holds every condition", async () => {
    const k = kit({ conditionCount: 2 })
    const user = userEvent.setup()
    render(<GroupBox group={GROUP} first={1} kit={k} gutter={null} />)
    const remove = tid("admin-cleanup-group-a1-remove")
    expect(remove).toHaveAttribute("aria-disabled", "true")
    expect(remove).toHaveAccessibleDescription("A rule needs at least one condition")
    await user.click(remove)
    expect(k.onAction).not.toHaveBeenCalled()
  })

  it("puts the Undo line of a removed member in its place", () => {
    render(<GroupBox group={GROUP} first={1} kit={kit()} gutter={null} undo={{ at: 1, line: <p data-testid="undo-line">Condition removed</p> }} />)
    const rows = tid("admin-cleanup-group-a1").querySelectorAll('[data-slot="condition-row"], [data-testid="undo-line"]')
    expect(Array.from(rows, (row) => row.getAttribute("data-row") ?? row.getAttribute("data-testid"))).toEqual(["c3", "undo-line", "c4"])
  })
})
