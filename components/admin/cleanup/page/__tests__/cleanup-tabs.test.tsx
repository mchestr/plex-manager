/**
 * The tabs of `/admin/cleanup` (UX 3.2, 8.1, 10.2): the five tabs in order
 * with their ids, the Leaving soon count (none at 0), and a switch that
 * replaces `?tab=` with no scroll, Rules leaving the URL bare.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { CleanupTabs } from "@/components/admin/cleanup/page/cleanup-tabs"

const mockReplace = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ replace: mockReplace, push: jest.fn(), refresh: jest.fn() }) }))

beforeEach(() => jest.clearAllMocks())

describe("CleanupTabs", () => {
  it("lists the five tabs in order, selects the active one and shows its panel", () => {
    render(
      <CleanupTabs active="kept" leavingCount={52}>
        <p>Kept panel</p>
      </CleanupTabs>
    )

    const list = screen.getByTestId("admin-cleanup-tabs")
    expect(list).toHaveAccessibleName("Media cleanup")
    expect(within(list).getAllByRole("tab").map((tab) => tab.dataset.testid)).toEqual([
      "admin-cleanup-tab-rules",
      "admin-cleanup-tab-leaving-soon",
      "admin-cleanup-tab-kept",
      "admin-cleanup-tab-history",
      "admin-cleanup-tab-settings",
    ])
    expect(within(list).getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Rules", "Leaving soon52", "Kept and excluded", "History", "Settings"])
    expect(screen.getByTestId("admin-cleanup-tab-kept")).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Kept panel")
  })

  it("shows no count on Leaving soon at 0, and a large count with its group separator", () => {
    const { rerender } = render(<CleanupTabs active="rules" leavingCount={0}>{null}</CleanupTabs>)
    expect(screen.queryByTestId("admin-cleanup-tab-leaving-soon-count")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-tab-leaving-soon")).toHaveTextContent(/^Leaving soon$/)

    rerender(<CleanupTabs active="rules" leavingCount={1204}>{null}</CleanupTabs>)
    expect(screen.getByTestId("admin-cleanup-tab-leaving-soon-count")).toHaveTextContent("1,204")
  })

  it("replaces ?tab= without a scroll, Rules with the bare URL, and does nothing for the active tab", async () => {
    const user = userEvent.setup()
    render(<CleanupTabs active="leaving-soon" leavingCount={3}>{null}</CleanupTabs>)

    await user.click(screen.getByTestId("admin-cleanup-tab-leaving-soon"))
    expect(mockReplace).not.toHaveBeenCalled()
    await user.click(screen.getByTestId("admin-cleanup-tab-history"))
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/cleanup?tab=history", { scroll: false })
    await user.click(screen.getByTestId("admin-cleanup-tab-rules"))
    expect(mockReplace).toHaveBeenLastCalledWith("/admin/cleanup", { scroll: false })
  })
})
