/**
 * The footer of the Why Sheet (UX 4.5, 8.5, TS 12.6 `why/`): Exclude this
 * {item}... on every live surface, Postpone... for a title in Leaving soon on
 * the Leaving soon surfaces, Close, and a read-only History. After a
 * successful Postpone or Exclude it tells the owner (`onActionDone`) and
 * closes the Sheet.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { excludeCleanupItems, postponeCleanupItems } from "@/actions/admin/cleanup-items"
import { WhyFooter, type WhyFooterProps } from "@/components/admin/cleanup/why/why-footer"
import type { WhySheetData } from "@/lib/cleanup/types/preview"

jest.mock("@/actions/admin/cleanup-items", () => ({ excludeCleanupItems: jest.fn(), postponeCleanupItems: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const DATA: WhySheetData = {
  item: { itemKey: "movie:tmdb:1", level: "movie", title: "Invented Movie", year: 2021, seasonNumber: null, episodeCount: null, seasonCount: null,
    posterKey: "5001", sectionId: "1", sizeBytes: "1000" },
  state: "leaving",
  addedAt: null,
  links: { plexUrl: null, arrUrl: null },
  conditions: [],
  hints: [],
  protections: [],
  otherRules: [],
  leaving: { enteredAt: "2026-10-01T03:07:00.000Z", leaveOn: "2026-11-20", status: "leaving" },
  sources: [],
}

const onClose = jest.fn()
const onActionDone = jest.fn()
const renderFooter = (props: Partial<WhyFooterProps> = {}) =>
  render(<WhyFooter data={DATA} surface="leaving" onClose={onClose} onActionDone={onActionDone} {...props} />)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(excludeCleanupItems).mockResolvedValue({ success: true, data: { excluded: 1, rescued: 1, skipped: 0 } })
  jest.mocked(postponeCleanupItems).mockResolvedValue({ success: true, data: { postponed: 1, skipped: 0, firstLeaveOn: "2026-11-27", lastLeaveOn: "2026-11-27" } })
})

describe("WhyFooter", () => {
  it("offers Exclude and Postpone in Leaving soon, and Close", async () => {
    const user = userEvent.setup()
    renderFooter()
    expect(screen.getByTestId("admin-cleanup-why-exclude")).toHaveTextContent("Exclude this movie...")
    expect(screen.getByTestId("admin-cleanup-why-postpone")).toHaveTextContent("Postpone...")
    await user.click(screen.getByTestId("admin-cleanup-why-close"))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("offers only Exclude on a preview surface, and on a Leaving soon surface for a title not in Leaving soon", () => {
    const { unmount } = renderFooter({ surface: "preview" })
    expect(screen.getByTestId("admin-cleanup-why-exclude")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-why-postpone")).not.toBeInTheDocument()
    unmount()
    renderFooter({ data: { ...DATA, state: "match", leaving: undefined } })
    expect(screen.queryByTestId("admin-cleanup-why-postpone")).not.toBeInTheDocument()
  })

  it.each([
    ["History", { surface: "history" as const }],
    ["a deleted title", { data: { ...DATA, state: "deleted" as const } }],
    ["a stored Why", { data: { ...DATA, fromRun: { runId: "run-1", at: "2026-11-03T03:07:00.000Z" } } }],
    ["no data yet", { data: undefined }],
  ])("is read only for %s: only Close", (_label, props) => {
    renderFooter(props)
    expect(screen.queryByTestId("admin-cleanup-why-exclude")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-why-postpone")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-why-close")).toBeInTheDocument()
  })

  it("excludes the title by its key and name, then calls onActionDone and closes the Sheet", async () => {
    const user = userEvent.setup()
    renderFooter()
    await user.click(screen.getByTestId("admin-cleanup-why-exclude"))
    const dialog = await screen.findByTestId("admin-cleanup-exclude-dialog")
    expect(within(dialog).getByRole("heading", { name: "Exclude Invented Movie from cleanup?" })).toBeInTheDocument()
    await user.click(screen.getByTestId("admin-cleanup-exclude-confirm"))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(excludeCleanupItems).toHaveBeenCalledWith({ itemKeys: ["movie:tmdb:1"], until: null })
    expect(onActionDone).toHaveBeenCalledWith({ excluded: 1, rescued: 1, skipped: 0 })
    expect(onActionDone.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0])
  })

  it("postpones a season by its leave date, says its show moves too, then calls onActionDone and closes the Sheet", async () => {
    const user = userEvent.setup()
    const season = { ...DATA, item: { ...DATA.item, itemKey: "season:tvdb:9:2", level: "season" as const, title: "Invented Show", seasonNumber: 2 } }
    renderFooter({ data: season })
    expect(screen.getByTestId("admin-cleanup-why-exclude")).toHaveTextContent("Exclude this season...")
    await user.click(screen.getByTestId("admin-cleanup-why-postpone"))
    const dialog = await screen.findByTestId("admin-cleanup-postpone-dialog")
    expect(dialog).toHaveTextContent("The whole show moves with it.")
    await user.click(screen.getByTestId("admin-cleanup-postpone-confirm"))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(postponeCleanupItems).toHaveBeenCalledWith({ itemKeys: ["season:tvdb:9:2"], days: 7 })
    expect(onActionDone).toHaveBeenCalledWith(expect.objectContaining({ postponed: 1 }))
  })

  it("keeps the Sheet open when the Exclude fails, and closes only the dialog on Cancel", async () => {
    const user = userEvent.setup()
    jest.mocked(excludeCleanupItems).mockResolvedValueOnce({ success: false, code: "CLEANUP_DELETING",
      error: "This title, or part of it, is being deleted now. Try again in a few minutes." })
    renderFooter({ onActionDone: undefined })
    await user.click(screen.getByTestId("admin-cleanup-why-exclude"))
    await user.click(await screen.findByTestId("admin-cleanup-exclude-confirm"))
    expect(await screen.findByText("This title, or part of it, is being deleted now. Try again in a few minutes.")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-exclude-dialog")).not.toBeInTheDocument())
    expect(onClose).not.toHaveBeenCalled()
  })
})
