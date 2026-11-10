/**
 * An entry batch card (UX 4.7.1, `shots/15`, X3): the held count, the badge,
 * the words for a scheduled and an admin run, Review, the Dry run dialog and
 * "Put {N} {items} in Leaving soon..." with its dialog, and the pause.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { approveCleanupEntryBatch } from "@/actions/admin/cleanup-items"
import { entryBatch, HASH_B, REVIEWED_AT } from "@/components/admin/cleanup/history/__tests__/fixtures"
import { EntryBatchCard } from "@/components/admin/cleanup/leaving/entry-batch-card"

jest.mock("@/actions/admin/cleanup-items", () => ({ approveCleanupEntryBatch: jest.fn() }))
jest.mock("@/actions/admin/cleanup-rules", () => ({ moveCleanupRuleToDryRun: jest.fn(), setCleanupRuleReviewFirst: jest.fn(), deleteCleanupRule: jest.fn() }))
const mockShowSuccess = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const BASE = "admin-cleanup-batch-entry-rule-2"

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(approveCleanupEntryBatch).mockResolvedValue({ success: true, data: { joined: 52 } })
})

describe("EntryBatchCard", () => {
  it("names the held matches of last night's run, with the badge and the three buttons", () => {
    render(<EntryBatchCard batch={entryBatch()} paused={false} leavingCount={4} />)
    const card = screen.getByTestId(BASE)
    expect(within(card).getByRole("heading", { name: "52 new matches wait to join Leaving soon" })).toBeInTheDocument()
    expect(card).toHaveTextContent("Held by the entry check")
    expect(card).toHaveTextContent("Old seasons nobody plays found 52 new seasons last night. That is more than 50, so the run added none. Members see nothing yet.")
    expect(screen.getByTestId(`${BASE}-review`)).toHaveTextContent("Review the 52 seasons")
    expect(screen.getByTestId(`${BASE}-review`)).toHaveAttribute("href", "/admin/cleanup/rules/rule-2")
    expect(screen.getByTestId(`${BASE}-dry-run`)).toHaveTextContent("Move the rule back to Dry run...")
    expect(screen.getByTestId(`${BASE}-put`)).toHaveTextContent("Put 52 seasons in Leaving soon...")
  })

  it("names the time of a run that an admin started, and one match in the singular", () => {
    render(<EntryBatchCard batch={entryBatch({ count: 1, level: "movie", heldBy: { trigger: "admin", at: "2026-11-08T21:42:00.000Z" } })} paused={false}
      leavingCount={0} />)
    expect(screen.getByRole("heading", { name: "1 new match waits to join Leaving soon" })).toBeInTheDocument()
    expect(screen.getByTestId(BASE)).toHaveTextContent("found 1 new movie in the run at 9:42 PM.")
  })

  it("puts the batch in Leaving soon after one confirm, with the numbers that the card showed", async () => {
    const user = userEvent.setup()
    render(<EntryBatchCard batch={entryBatch()} paused={false} leavingCount={0} />)
    await user.click(screen.getByTestId(`${BASE}-put`))
    const dialog = await screen.findByTestId("admin-cleanup-entry-dialog")
    expect(within(dialog).getByRole("heading", { name: "Put 52 seasons in Leaving soon?" })).toBeInTheDocument()
    expect(dialog).toHaveTextContent("The entry check held these new matches of Old seasons nobody plays.")
    expect(dialog).toHaveTextContent("Nothing is deleted now.")
    await user.click(screen.getByTestId("admin-cleanup-entry-confirm"))
    expect(approveCleanupEntryBatch).toHaveBeenCalledWith({ batchId: "entry-rule-2", count: 52, keysHash: HASH_B, excludeKeys: [], reviewedAt: REVIEWED_AT })
    expect(mockShowSuccess).toHaveBeenCalledWith("52 titles put in Leaving soon.")
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-entry-dialog")).not.toBeInTheDocument())
  })

  it("keeps the dialog open with the error of a refused approval", async () => {
    const user = userEvent.setup()
    jest.mocked(approveCleanupEntryBatch).mockResolvedValue({ success: false, code: "CLEANUP_REVIEW_STALE", error: "The numbers changed. Check them again." })
    render(<EntryBatchCard batch={entryBatch()} paused={false} leavingCount={0} />)
    await user.click(screen.getByTestId(`${BASE}-put`))
    await user.click(await screen.findByTestId("admin-cleanup-entry-confirm"))
    expect(await screen.findByTestId("admin-cleanup-entry-dialog")).toHaveTextContent("The numbers changed. Check them again.")
  })

  it("opens the Dry run dialog of the rule with its titles in Leaving soon", async () => {
    const user = userEvent.setup()
    render(<EntryBatchCard batch={entryBatch()} paused={false} leavingCount={4} />)
    await user.click(screen.getByTestId(`${BASE}-dry-run`))
    const dialog = await screen.findByTestId("admin-cleanup-dry-run-mode-dialog")
    expect(dialog).toHaveTextContent("Move Old seasons nobody plays back to Dry run?")
    expect(dialog).toHaveTextContent("Its 4 seasons leave Leaving soon, unless another rule holds them.")
  })

  it("holds the Put button while cleanup is paused, focusable with the reason", () => {
    render(<EntryBatchCard batch={entryBatch()} paused leavingCount={0} />)
    const put = screen.getByTestId(`${BASE}-put`)
    expect(put).toHaveAttribute("aria-disabled", "true")
    expect(document.getElementById(put.getAttribute("aria-describedby") ?? "")).toHaveTextContent("Cleanup is paused. Resume it first.")
  })
})
