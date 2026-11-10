/**
 * The three rule confirms (UX 8.6, 7.13, plan D8): their words by mode and
 * count, both buttons, the action they call, the toast and the result they
 * pass on, and an error that stays inside the dialog.
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { deleteCleanupRule, moveCleanupRuleToDryRun, setCleanupRuleReviewFirst } from "@/actions/admin/cleanup-rules"
import { DeleteRuleDialog, type DialogRule, MoveToDryRunDialog, ReviewFirstDialog } from "@/components/admin/cleanup/rules/rule-dialogs"

jest.mock("@/actions/admin/cleanup-rules", () => ({
  deleteCleanupRule: jest.fn(),
  moveCleanupRuleToDryRun: jest.fn(),
  setCleanupRuleReviewFirst: jest.fn(),
}))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const SHOWS: DialogRule = { id: "rule-1", name: "Big shows nobody plays", level: "show", mode: "reviewFirst" }
const OLD: DialogRule = { id: "rule-2", name: "Old seasons nobody plays", level: "season", mode: "automatic" }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(moveCleanupRuleToDryRun).mockResolvedValue({ success: true, data: { released: 21, revision: 4, mode: "dryRun" } })
  jest.mocked(setCleanupRuleReviewFirst).mockResolvedValue({ success: true, data: { revision: 6, mode: "reviewFirst" } })
  jest.mocked(deleteCleanupRule).mockResolvedValue({ success: true, data: { released: 31 } })
})

describe("MoveToDryRunDialog", () => {
  it("names the rule and what leaves, moves it, toasts and passes the new revision and mode on", async () => {
    const user = userEvent.setup()
    const onMoved = jest.fn()
    const onOpenChange = jest.fn()
    render(<MoveToDryRunDialog rule={SHOWS} leavingCount={21} open onOpenChange={onOpenChange} onMoved={onMoved} />)
    const dialog = screen.getByTestId("admin-cleanup-dry-run-mode-dialog")
    expect(dialog).toHaveTextContent("Move Big shows nobody plays back to Dry run?")
    expect(dialog).toHaveTextContent("Its 21 shows leave Leaving soon, unless another rule holds them. Members see them go. Nothing is deleted. Dry runs continue.")

    await user.click(screen.getByTestId("admin-cleanup-dry-run-mode-confirm"))
    await waitFor(() => expect(onMoved).toHaveBeenCalledWith({ released: 21, revision: 4, mode: "dryRun" }))
    expect(moveCleanupRuleToDryRun).toHaveBeenCalledWith({ ruleId: "rule-1" })
    expect(mockShowSuccess).toHaveBeenCalledWith("Rule moved to Dry run")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("names the due titles that another rule keeps, and leaves out the leave line with none in Leaving soon", () => {
    render(<MoveToDryRunDialog rule={SHOWS} leavingCount={0} dueElsewhere={{ count: 1, ruleName: "Finished shows" }} open onOpenChange={jest.fn()} />)
    expect(screen.getByTestId("admin-cleanup-dry-run-mode-dialog")).toHaveTextContent(
      "Nothing is deleted. Dry runs continue. 1 show is due and stays in Leaving soon through Finished shows. It deletes it at the next nightly run, inside the budget."
    )
    expect(screen.queryByText(/leave Leaving soon, unless/)).not.toBeInTheDocument()
  })

  it("names several due titles in the plural", () => {
    render(<MoveToDryRunDialog rule={SHOWS} leavingCount={5} dueElsewhere={{ count: 3, ruleName: "Finished shows" }} open onOpenChange={jest.fn()} />)
    expect(screen.getByTestId("admin-cleanup-dry-run-mode-dialog")).toHaveTextContent(
      "3 shows are due and stay in Leaving soon through Finished shows. It deletes them at the next nightly run, inside the budget."
    )
  })

  it("cancels with nothing changed, and shows a refusal inside the dialog", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    const { rerender } = render(<MoveToDryRunDialog rule={SHOWS} leavingCount={2} dueElsewhere={{ count: 0, ruleName: "x" }} open onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(moveCleanupRuleToDryRun).not.toHaveBeenCalled()

    rerender(<MoveToDryRunDialog rule={SHOWS} leavingCount={2} open onOpenChange={onOpenChange} />)
    jest.mocked(moveCleanupRuleToDryRun).mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "A run is in progress. Try again in a few minutes." })
    await user.click(screen.getByTestId("admin-cleanup-dry-run-mode-confirm"))
    expect(await screen.findByText("A run is in progress. Try again in a few minutes.")).toBeInTheDocument()
    expect(mockShowSuccess).not.toHaveBeenCalled()
  })
})

describe("ReviewFirstDialog", () => {
  it("switches an Automatic rule, toasts and passes the new revision and mode on", async () => {
    const user = userEvent.setup()
    const onSwitched = jest.fn()
    render(<ReviewFirstDialog rule={OLD} open onOpenChange={jest.fn()} onSwitched={onSwitched} />)
    const dialog = screen.getByTestId("admin-cleanup-review-first-dialog")
    expect(dialog).toHaveTextContent("Switch Old seasons nobody plays to Review first?")
    expect(dialog).toHaveTextContent("Items keep their leave dates. At each leave date, the batch waits for your approval.")
    await user.click(screen.getByTestId("admin-cleanup-review-first-confirm"))
    await waitFor(() => expect(onSwitched).toHaveBeenCalledWith({ revision: 6, mode: "reviewFirst" }))
    expect(mockShowSuccess).toHaveBeenCalledWith("Mode changed")
  })

  it("keeps a refusal inside the dialog", async () => {
    const user = userEvent.setup()
    jest.mocked(setCleanupRuleReviewFirst).mockResolvedValueOnce({ success: false, code: "VALIDATION", error: "Turn the rule on from its review page." })
    render(<ReviewFirstDialog rule={OLD} open onOpenChange={jest.fn()} />)
    await user.click(screen.getByTestId("admin-cleanup-review-first-confirm"))
    expect(await screen.findByText("Turn the rule on from its review page.")).toBeInTheDocument()
  })
})

describe("DeleteRuleDialog", () => {
  it("is destructive, names what leaves and what stays in History, and deletes", async () => {
    const user = userEvent.setup()
    const onDeleted = jest.fn()
    render(<DeleteRuleDialog rule={OLD} leavingCount={31} open onOpenChange={jest.fn()} onDeleted={onDeleted} />)
    const dialog = screen.getByTestId("admin-cleanup-delete-rule-dialog")
    expect(dialog).toHaveTextContent("Delete the rule Old seasons nobody plays?")
    expect(dialog).toHaveTextContent("Its 31 seasons leave Leaving soon, unless another rule holds them. Its runs and deleted titles stay in History.")
    await user.click(screen.getByTestId("admin-cleanup-delete-rule-confirm"))
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith({ released: 31 }))
    expect(deleteCleanupRule).toHaveBeenCalledWith({ ruleId: "rule-2" })
    expect(mockShowSuccess).toHaveBeenCalledWith("Rule deleted")
  })

  it("says only that the dry runs stay for a Dry run rule, and only History for a live rule with none in Leaving soon", () => {
    const { rerender } = render(<DeleteRuleDialog rule={{ ...OLD, mode: "dryRun" }} leavingCount={0} open onOpenChange={jest.fn()} />)
    expect(screen.getByTestId("admin-cleanup-delete-rule-dialog")).toHaveTextContent("Its dry runs stay in History.")
    rerender(<DeleteRuleDialog rule={OLD} leavingCount={0} open onOpenChange={jest.fn()} />)
    expect(screen.getByTestId("admin-cleanup-delete-rule-dialog")).toHaveTextContent(/^Delete the rule Old seasons nobody plays\?Its runs and deleted titles stay in History\./)
  })

  it("keeps a refusal inside the dialog", async () => {
    const user = userEvent.setup()
    jest.mocked(deleteCleanupRule).mockResolvedValueOnce({ success: false, code: "CONFLICT", error: "A run is in progress. Try again in a few minutes." })
    render(<DeleteRuleDialog rule={OLD} leavingCount={1} open onOpenChange={jest.fn()} />)
    await user.click(screen.getByTestId("admin-cleanup-delete-rule-confirm"))
    expect(await screen.findByText("A run is in progress. Try again in a few minutes.")).toBeInTheDocument()
  })
})
