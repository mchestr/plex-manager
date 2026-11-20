/**
 * The page header actions of Media cleanup (UX 4.0 item 3, 8.1, 10.2):
 * "Pause all cleanup" and "New rule" while on, "Resume cleanup" while
 * paused, no Pause while off, the confirms they open, focus kept on the one
 * toggle after a success, and the New rule Sheet.
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { pauseCleanup, resumeCleanup } from "@/actions/admin/cleanup-settings"
import { HeaderActions } from "@/components/admin/cleanup/page/header-actions"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"

jest.mock("@/actions/admin/cleanup-settings", () => ({ pauseCleanup: jest.fn(), resumeCleanup: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
jest.mock("@/components/admin/cleanup/new-rule/new-rule-sheet", () => ({
  NewRuleSheet: ({ trigger, recipes, graceDays }: { trigger: React.ReactElement; recipes: RecipeCardData[]; graceDays: number }) => (
    <span data-testid="new-rule-sheet" data-recipes={recipes.length} data-grace={graceDays}>
      {trigger}
    </span>
  ),
}))

const NOW = Date.parse("2026-11-08T12:00:00.000Z")
const ON = { enabled: true, pausedAt: null }
const PAUSED = { enabled: true, pausedAt: "2026-11-08T09:12:00.000Z" }
const RECIPES = [{ id: "never-watched-movies" } as RecipeCardData]

const renderActions = (feature: { enabled: boolean; pausedAt: string | null }) =>
  render(<HeaderActions feature={feature} recipes={RECIPES} graceDays={30} now={NOW} />)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(pauseCleanup).mockResolvedValue({ success: true, data: { unapproved: 0 } })
  jest.mocked(resumeCleanup).mockResolvedValue({ success: true, data: { holdUntil: "2026-11-15" } })
})

describe("HeaderActions", () => {
  it("offers Pause all cleanup, then New rule with the recipes and the grace period", () => {
    renderActions(ON)

    const pause = screen.getByTestId("admin-cleanup-pause")
    const newRule = screen.getByTestId("admin-cleanup-new-rule")
    expect(pause).toHaveTextContent("Pause all cleanup")
    expect(newRule).toHaveTextContent("New rule")
    expect(pause.compareDocumentPosition(newRule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByTestId("new-rule-sheet")).toHaveAttribute("data-recipes", "1")
    expect(screen.getByTestId("new-rule-sheet")).toHaveAttribute("data-grace", "30")
    expect(screen.queryByTestId("admin-cleanup-resume")).not.toBeInTheDocument()
  })

  it("hides Pause while the feature is off, and still offers New rule", () => {
    renderActions({ enabled: false, pausedAt: null })

    expect(screen.queryByTestId("admin-cleanup-pause")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-resume")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-new-rule")).toBeInTheDocument()
  })

  it("pauses through the confirm, and keeps focus on the toggle as it turns into Resume", async () => {
    const user = userEvent.setup()
    const { rerender } = renderActions(ON)

    await user.click(screen.getByTestId("admin-cleanup-pause"))
    expect(await screen.findByTestId("admin-cleanup-pause-dialog")).toHaveTextContent("Pause all cleanup?")
    await user.click(screen.getByTestId("admin-cleanup-pause-confirm"))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-pause-dialog")).not.toBeInTheDocument())
    expect(pauseCleanup).toHaveBeenCalledTimes(1)

    rerender(<HeaderActions feature={PAUSED} recipes={RECIPES} graceDays={30} now={NOW} />)
    const resume = screen.getByTestId("admin-cleanup-resume")
    expect(resume).toHaveTextContent("Resume cleanup")
    await waitFor(() => expect(resume).toHaveFocus())
  })

  it("resumes through the confirm that names the end of the hold, also while the feature is off", async () => {
    const user = userEvent.setup()
    renderActions({ enabled: false, pausedAt: PAUSED.pausedAt })

    await user.click(screen.getByTestId("admin-cleanup-resume"))
    expect(await screen.findByTestId("admin-cleanup-resume-dialog")).toHaveTextContent("Nothing is deleted before Nov 15, 2026")
    await user.click(screen.getByTestId("admin-cleanup-resume-confirm"))
    await waitFor(() => expect(resumeCleanup).toHaveBeenCalledTimes(1))
  })

  it("closes an open confirm on Cancel and calls nothing", async () => {
    const user = userEvent.setup()
    renderActions(ON)

    await user.click(screen.getByTestId("admin-cleanup-pause"))
    await user.click(await screen.findByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-pause-dialog")).not.toBeInTheDocument())
    expect(pauseCleanup).not.toHaveBeenCalled()
  })
})
