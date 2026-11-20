import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { ConditionMenu, type MenuRowKind } from "@/components/admin/cleanup/editor/condition-menu"

const TARGETS = [
  { id: "c1", sentence: "Added more than 365 days ago" },
  { id: "c2", sentence: "Last played more than 365 days ago, or never" },
  { id: "c3", sentence: "Size more than 20 GB" },
]

function renderMenu(kind: MenuRowKind, props: Partial<Parameters<typeof ConditionMenu>[0]> = {}) {
  const onAction = jest.fn()
  // Base UI turns pointer events off on a submenu while it opens
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  const id = kind === "protection" ? "p1" : "c2"
  render(<ConditionMenu id={id} kind={kind} targets={TARGETS} variant="row" canRemove onAction={onAction} {...props} />)
  return { user, onAction }
}

/**
 * Picks a target of the group-with submenu by keyboard, as a pointer pick
 * races Base UI's guard against a release on an item that just opened.
 */
async function pickGroupTarget(user: ReturnType<typeof userEvent.setup>, triggerId: string, index: number) {
  screen.getByTestId(triggerId).focus()
  await user.keyboard("{Enter}")
  await screen.findByTestId(`${triggerId}-duplicate`)
  await user.keyboard("{ArrowDown}{ArrowRight}")
  await screen.findByText("Group with")
  await user.keyboard(`${"{ArrowDown}".repeat(index)}{Enter}`)
}

const items = async () => (await screen.findAllByRole("menuitem")).map((item) => item.textContent)

describe("ConditionMenu", () => {
  it("offers a top-level condition: Duplicate, Move into an any-of group with..., Turn into a protection, Remove", async () => {
    const { user, onAction } = renderMenu("condition")
    const trigger = screen.getByTestId("admin-cleanup-condition-c2-menu")
    expect(trigger).toHaveAccessibleName("More actions for this condition")
    await user.click(trigger)
    expect(await items()).toEqual([
      "Duplicate",
      "Move into an any-of group with...Choose another condition. Both go into a new group.",
      "Turn into a protectionMoves it to Never touch with the same values.",
      "Remove",
    ])
    await user.click(screen.getByTestId("admin-cleanup-condition-c2-menu-duplicate"))
    expect(onAction).toHaveBeenLastCalledWith({ type: "duplicate", id: "c2" })
    await user.click(trigger)
    await user.click(await screen.findByTestId("admin-cleanup-condition-c2-menu-protection"))
    expect(onAction).toHaveBeenLastCalledWith({ type: "toProtection", id: "c2" })
    await user.click(trigger)
    await user.click(await screen.findByTestId("admin-cleanup-condition-c2-menu-remove"))
    expect(onAction).toHaveBeenLastCalledWith({ type: "remove", id: "c2" })
  })

  it("lists the other top-level conditions by their sentence in the group-with submenu", async () => {
    const { user, onAction } = renderMenu("condition")
    await user.click(screen.getByTestId("admin-cleanup-condition-c2-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-condition-c2-menu-group"))
    expect(await screen.findByText("Group with")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-condition-c2-menu-group-c1")).toHaveTextContent("Added more than 365 days ago")
    expect(screen.getByTestId("admin-cleanup-condition-c2-menu-group-c3")).toHaveTextContent("Size more than 20 GB")
    expect(screen.queryByTestId("admin-cleanup-condition-c2-menu-group-c2")).toBeNull()
    await user.keyboard("{Escape}{Escape}")
    await waitFor(() => expect(screen.queryByText("Group with")).toBeNull())
    await pickGroupTarget(user, "admin-cleanup-condition-c2-menu", 1)
    expect(onAction).toHaveBeenCalledWith({ type: "groupWith", id: "c2", targetId: "c3" })
  })

  it("offers Move out of the group to a group member", async () => {
    const { user, onAction } = renderMenu("member")
    await user.click(screen.getByTestId("admin-cleanup-condition-c2-menu"))
    expect(await items()).toEqual(["Duplicate", "Move out of the group", "Turn into a protectionMoves it to Never touch with the same values.", "Remove"])
    await user.click(screen.getByTestId("admin-cleanup-condition-c2-menu-ungroup"))
    expect(onAction).toHaveBeenCalledWith({ type: "moveOut", id: "c2" })
  })

  it("offers Turn into a condition to a protection", async () => {
    const { user, onAction } = renderMenu("protection")
    const trigger = screen.getByTestId("admin-cleanup-protection-p1-menu")
    expect(trigger).toHaveAccessibleName("More actions for this protection")
    await user.click(trigger)
    expect(await items()).toEqual(["Duplicate", "Turn into a condition", "Remove"])
    await user.click(screen.getByTestId("admin-cleanup-protection-p1-menu-condition"))
    expect(onAction).toHaveBeenCalledWith({ type: "toCondition", id: "p1" })
  })

  it("refuses Remove and Turn into a protection on the last condition, and grouping with no other condition", async () => {
    const { user } = renderMenu("condition", { canRemove: false, targets: [TARGETS[1]] })
    await user.click(screen.getByTestId("admin-cleanup-condition-c2-menu"))
    expect(await screen.findByTestId("admin-cleanup-condition-c2-menu-remove")).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByTestId("admin-cleanup-condition-c2-menu-protection")).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByTestId("admin-cleanup-condition-c2-menu-group")).toHaveAttribute("aria-disabled", "true")
  })

  it("in the phone Sheet header: the editor's ids, a 44 px trigger, no Remove and no item notes", async () => {
    const { user, onAction } = renderMenu("condition", { variant: "sheet" })
    const trigger = screen.getByTestId("admin-cleanup-condition-editor-menu")
    expect(trigger.className).toContain("size-11")
    await user.click(trigger)
    expect(await items()).toEqual(["Duplicate", "Move into an any-of group with...", "Turn into a protection"])
    await user.keyboard("{Escape}")
    await pickGroupTarget(user, "admin-cleanup-condition-editor-menu", 0)
    expect(onAction).toHaveBeenCalledWith({ type: "groupWith", id: "c2", targetId: "c1" })
  })
})
