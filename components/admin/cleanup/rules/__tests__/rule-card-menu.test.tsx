/**
 * The rule menu of the card and the editor (UX 4.1.3 item 3, UX 4.3.2, plan
 * D8): the items by mode and variant, the test id prefixes, "Run dry run
 * now" and "Duplicate" with their toasts, the reason without Redis, the three
 * confirms, `onRuleChanged` in the editor (TS 12.6, architecture-r2-1), the
 * Rules tab after a delete from the editor, and the close as the page hides.
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Activity } from "react"

import {
  deleteCleanupRule,
  duplicateCleanupRule,
  moveCleanupRuleToDryRun,
  runCleanupRuleDryRun,
  setCleanupRuleReviewFirst,
} from "@/actions/admin/cleanup-rules"
import { RuleCardMenu, type RuleCardMenuProps } from "@/components/admin/cleanup/rules/rule-card-menu"
import type { DialogRule } from "@/components/admin/cleanup/rules/rule-dialogs"

jest.mock("@/actions/admin/cleanup-rules", () => ({
  deleteCleanupRule: jest.fn(),
  duplicateCleanupRule: jest.fn(),
  moveCleanupRuleToDryRun: jest.fn(),
  runCleanupRuleDryRun: jest.fn(),
  setCleanupRuleReviewFirst: jest.fn(),
}))

const mockPush = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const rule = (mode: DialogRule["mode"]): DialogRule => ({ id: "rule-1", name: "Movies nobody watches", level: "movie", mode })

function renderMenu(props: Partial<RuleCardMenuProps> = {}) {
  const onRuleChanged = jest.fn()
  render(<RuleCardMenu variant="card" rule={rule("dryRun")} leavingCount={21} redis onRuleChanged={onRuleChanged} {...props} />)
  return { onRuleChanged }
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, id = "admin-cleanup-rule-rule-1-menu") {
  await user.click(screen.getByTestId(id))
  return screen.findByRole("menu")
}

const items = (menu: HTMLElement) => within(menu).getAllByRole("menuitem").map((item) => item.textContent)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(runCleanupRuleDryRun).mockResolvedValue({ success: true, data: { queued: true } })
  jest.mocked(duplicateCleanupRule).mockResolvedValue({ success: true, data: { ruleId: "rule-copy" } })
  jest.mocked(moveCleanupRuleToDryRun).mockResolvedValue({ success: true, data: { released: 21, revision: 4, mode: "dryRun" } })
  jest.mocked(setCleanupRuleReviewFirst).mockResolvedValue({ success: true, data: { revision: 6, mode: "reviewFirst" } })
  jest.mocked(deleteCleanupRule).mockResolvedValue({ success: true, data: { released: 21 } })
})

describe("RuleCardMenu on a card", () => {
  it("is a ghost button named for the rule, with the Dry run items", async () => {
    const user = userEvent.setup()
    renderMenu()
    expect(screen.getByRole("button", { name: "More actions for Movies nobody watches" })).toHaveAttribute("data-testid", "admin-cleanup-rule-rule-1-menu")
    const menu = await openMenu(user)
    expect(within(menu).getByText("Movies nobody watches")).toBeInTheDocument()
    expect(items(menu)).toEqual(["Run dry run now", "Duplicate", "Delete rule..."])
    expect(screen.getByTestId("admin-cleanup-rule-rule-1-menu-delete")).toBeInTheDocument()
  })

  it("adds Change mode and Move back to Dry run on a Review first rule", async () => {
    const user = userEvent.setup()
    renderMenu({ rule: rule("reviewFirst") })
    const menu = await openMenu(user)
    expect(items(menu)).toEqual(["Run dry run now", "Duplicate", "Change mode...", "Move back to Dry run...", "Delete rule..."])
    expect(screen.getByTestId("admin-cleanup-rule-rule-1-menu-change-mode")).toHaveAttribute("href", "/admin/cleanup/rules/rule-1/turn-on")
    expect(screen.getByTestId("admin-cleanup-rule-rule-1-menu-dry-run-mode")).toBeInTheDocument()
  })

  it("adds Switch to Review first on an Automatic rule", async () => {
    const user = userEvent.setup()
    renderMenu({ rule: rule("automatic") })
    const menu = await openMenu(user)
    expect(items(menu)).toEqual(["Run dry run now", "Duplicate", "Change mode...", "Switch to Review first...", "Move back to Dry run...", "Delete rule..."])
    expect(within(menu).getAllByRole("separator")).toHaveLength(1)
  })

  it("starts a dry run and duplicates with toasts, and shows a refusal as an error toast", async () => {
    const user = userEvent.setup()
    renderMenu()
    await openMenu(user)
    await user.click(screen.getByTestId("admin-cleanup-rule-rule-1-menu-dry-run"))
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Dry run started"))
    expect(runCleanupRuleDryRun).toHaveBeenCalledWith({ ruleId: "rule-1" })

    await openMenu(user)
    await user.click(screen.getByTestId("admin-cleanup-rule-rule-1-menu-duplicate"))
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Rule duplicated"))
    expect(duplicateCleanupRule).toHaveBeenCalledWith({ ruleId: "rule-1" })

    jest.mocked(runCleanupRuleDryRun).mockResolvedValueOnce({ success: false, code: "UPSTREAM_UNAVAILABLE", error: "The job queue is unavailable. Try again in a minute." })
    jest.mocked(duplicateCleanupRule).mockResolvedValueOnce({ success: false, code: "VALIDATION", error: "You can have at most 50 rules." })
    await openMenu(user)
    await user.click(screen.getByTestId("admin-cleanup-rule-rule-1-menu-dry-run"))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("The job queue is unavailable. Try again in a minute."))
    await openMenu(user)
    await user.click(screen.getByTestId("admin-cleanup-rule-rule-1-menu-duplicate"))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("You can have at most 50 rules."))
  })

  it("disables Run dry run now without Redis, with the reason", async () => {
    const user = userEvent.setup()
    renderMenu({ redis: false })
    await openMenu(user)
    const item = screen.getByTestId("admin-cleanup-rule-rule-1-menu-dry-run")
    expect(item).toHaveAttribute("aria-disabled", "true")
    expect(item).toHaveTextContent("Run dry run nowRedis is not set up.")
  })

  it("moves a live rule back to Dry run through its confirm, and stays on the page", async () => {
    const user = userEvent.setup()
    const { onRuleChanged } = renderMenu({ rule: rule("reviewFirst") })
    await openMenu(user)
    await user.click(screen.getByTestId("admin-cleanup-rule-rule-1-menu-dry-run-mode"))
    const dialog = await screen.findByTestId("admin-cleanup-dry-run-mode-dialog")
    expect(dialog).toHaveTextContent("Its 21 movies leave Leaving soon")
    await user.click(screen.getByTestId("admin-cleanup-dry-run-mode-confirm"))
    await waitFor(() => expect(onRuleChanged).toHaveBeenCalledWith({ revision: 4, mode: "dryRun" }))
    expect(mockPush).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-dry-run-mode-dialog")).not.toBeInTheDocument())
  })

  it("deletes from the card and stays, with no editor callback", async () => {
    const user = userEvent.setup()
    const { onRuleChanged } = renderMenu({ rule: rule("automatic") })
    await openMenu(user)
    await user.click(screen.getByTestId("admin-cleanup-rule-rule-1-menu-delete"))
    await user.click(await screen.findByTestId("admin-cleanup-delete-rule-confirm"))
    await waitFor(() => expect(deleteCleanupRule).toHaveBeenCalledWith({ ruleId: "rule-1" }))
    expect(mockPush).not.toHaveBeenCalled()
    expect(onRuleChanged).not.toHaveBeenCalled()
  })

  it("closes an open confirm as the router hides the page", async () => {
    const user = userEvent.setup()
    const view = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <RuleCardMenu variant="card" rule={rule("automatic")} leavingCount={0} redis />
      </Activity>
    )
    const { rerender } = render(view("visible"))
    await openMenu(user)
    await user.click(screen.getByTestId("admin-cleanup-rule-rule-1-menu-review-first"))
    expect(await screen.findByTestId("admin-cleanup-review-first-dialog")).toBeInTheDocument()
    act(() => rerender(view("hidden")))
    act(() => rerender(view("visible")))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-review-first-dialog")).not.toBeInTheDocument())
  })
})

describe("RuleCardMenu in the editor", () => {
  it("is an outline More actions button with the editor ids and no Change mode", async () => {
    const user = userEvent.setup()
    renderMenu({ variant: "editor", rule: rule("automatic") })
    const button = screen.getByRole("button", { name: "More actions" })
    expect(button).toHaveAttribute("data-testid", "admin-cleanup-editor-menu")
    const menu = await openMenu(user, "admin-cleanup-editor-menu")
    expect(items(menu)).toEqual(["Run dry run now", "Duplicate", "Switch to Review first...", "Move back to Dry run...", "Delete rule..."])
    expect(within(menu).queryByText("Movies nobody watches")).not.toBeInTheDocument()
    for (const id of ["dry-run", "duplicate", "review-first", "dry-run-mode", "delete"]) {
      expect(screen.getByTestId(`admin-cleanup-editor-menu-${id}`)).toBeInTheDocument()
    }
  })

  it("passes each mode change to onRuleChanged and keeps the page", async () => {
    const user = userEvent.setup()
    const { onRuleChanged } = renderMenu({ variant: "editor", rule: rule("automatic") })
    await openMenu(user, "admin-cleanup-editor-menu")
    await user.click(screen.getByTestId("admin-cleanup-editor-menu-review-first"))
    await user.click(await screen.findByTestId("admin-cleanup-review-first-confirm"))
    await waitFor(() => expect(onRuleChanged).toHaveBeenCalledWith({ revision: 6, mode: "reviewFirst" }))

    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-review-first-dialog")).not.toBeInTheDocument())
    await openMenu(user, "admin-cleanup-editor-menu")
    await user.click(screen.getByTestId("admin-cleanup-editor-menu-dry-run-mode"))
    await user.click(await screen.findByTestId("admin-cleanup-dry-run-mode-confirm"))
    await waitFor(() => expect(onRuleChanged).toHaveBeenLastCalledWith({ revision: 4, mode: "dryRun" }))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("opens the Rules tab after a delete", async () => {
    const user = userEvent.setup()
    renderMenu({ variant: "editor" })
    await openMenu(user, "admin-cleanup-editor-menu")
    await user.click(screen.getByTestId("admin-cleanup-editor-menu-delete"))
    expect(await screen.findByTestId("admin-cleanup-delete-rule-dialog")).toHaveTextContent("Its dry runs stay in History.")
    await user.click(screen.getByTestId("admin-cleanup-delete-rule-confirm"))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/admin/cleanup"))
  })

  it("takes another test id prefix, and works with no callback", async () => {
    const user = userEvent.setup()
    render(<RuleCardMenu variant="editor" rule={rule("reviewFirst")} leavingCount={1} redis testIdPrefix="admin-cleanup-other" />)
    await openMenu(user, "admin-cleanup-other-menu")
    await user.click(screen.getByTestId("admin-cleanup-other-menu-dry-run-mode"))
    await user.click(await screen.findByTestId("admin-cleanup-dry-run-mode-confirm"))
    await waitFor(() => expect(moveCleanupRuleToDryRun).toHaveBeenCalled())
  })
})
