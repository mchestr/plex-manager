/**
 * The Problem reports tab: its own admin check before any read, the filter
 * from `?status=` (Needs you by default) with each filter's count, rows that
 * open their report with the reporter and how many others reported it, an
 * empty state per filter, and the settings card with the switch below the
 * list.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { updateProblemReportSettings } from "@/actions/admin/problem-reports"
import ProblemReportsPage from "@/app/admin/(automations)/problem-reports/page"
import { assertAdmin } from "@/lib/admin"
import { getProblemReportSettingsView, listProblemReports, type ProblemReportList } from "@/lib/data/problem-reports"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/data/problem-reports", () => ({ listProblemReports: jest.fn(), getProblemReportSettingsView: jest.fn() }))
jest.mock("@/actions/admin/problem-reports", () => ({ updateProblemReportSettings: jest.fn() }))
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: mockShowError }) }))

const AT = new Date("2026-11-08T20:00:00.000Z")
const LIST: ProblemReportList = {
  rows: [
    { id: "r1", title: "Heat (1995)", problem: "Won't start", reporter: { id: "m1", name: "Jane" }, others: 2, status: "WITH_ADMIN", createdAt: AT, updatedAt: AT },
    { id: "r2", title: "The Office S1E1: Pilot", problem: "No sound, or the sound cuts out", reporter: { id: "m2", name: "Sam" }, others: 0, status: "WITH_ADMIN", createdAt: AT, updatedAt: AT },
  ],
  counts: { "needs-you": 2, fixing: 0, fixed: 5, closed: 1 },
  total: 2,
}

const renderPage = async (status?: string) => render(await ProblemReportsPage({ searchParams: Promise.resolve(status ? { status } : {}) }))

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl("/admin/problem-reports")
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: "admin-1" } } as never)
  jest.mocked(listProblemReports).mockResolvedValue(LIST)
  jest.mocked(getProblemReportSettingsView).mockResolvedValue({ enabled: true, lastSaved: null })
  jest.mocked(updateProblemReportSettings).mockResolvedValue({ success: true, data: null })
})

describe("ProblemReportsPage", () => {
  it("checks the admin before reading anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))

    await expect(renderPage()).rejects.toThrow("PM_FORBIDDEN")
    expect(listProblemReports).not.toHaveBeenCalled()
  })

  it("lists the reports that need the admin, each opening its report, with the reporters", async () => {
    await renderPage()

    expect(listProblemReports).toHaveBeenCalledWith("needs-you", { page: 1, pageSize: 25 })
    const table = screen.getByTestId("admin-problem-reports")
    expect(within(table).getByRole("link", { name: "Heat (1995)" })).toHaveAttribute("href", "/admin/problem-reports/r1")
    expect(within(table).getByText("Jane +2")).toBeInTheDocument()
    expect(within(table).getByText("Sam")).toBeInTheDocument()
    expect(screen.getByTestId("admin-problem-reports-filter-needs-you")).toHaveTextContent("Needs you (2)")
    expect(screen.getByTestId("admin-problem-reports-filter-fixed")).toHaveTextContent("Fixed (5)")
  })

  it("reads the filter from the URL, and moves to another filter on page 1", async () => {
    const user = userEvent.setup()
    resetUrl("/admin/problem-reports?status=fixed&page=2")
    render(await ProblemReportsPage({ searchParams: Promise.resolve({ status: "fixed", page: "2" }) }))

    expect(listProblemReports).toHaveBeenCalledWith("fixed", { page: 2, pageSize: 25 })
    await user.click(screen.getByTestId("admin-problem-reports-filter-closed"))
    expect(currentHref()).toBe("/admin/problem-reports?status=closed")
  })

  it("falls back to Needs you for a filter it doesn't know", async () => {
    await renderPage("everything")

    expect(listProblemReports).toHaveBeenCalledWith("needs-you", expect.anything())
  })

  it("says when nothing needs the admin", async () => {
    jest.mocked(listProblemReports).mockResolvedValue({ ...LIST, rows: [], total: 0, counts: { ...LIST.counts, "needs-you": 0 } })
    await renderPage()

    expect(screen.getByTestId("admin-problem-reports-empty")).toHaveTextContent("Nothing needs you")
  })

  it("shows the switch below the list and saves it from Edit", async () => {
    const user = userEvent.setup()
    await renderPage()

    expect(screen.getByTestId("settings-problem-reports-summary-enabled")).toHaveTextContent("On")
    await user.click(screen.getByTestId("settings-problem-reports-edit"))
    await user.click(screen.getByTestId("admin-problem-reports-enabled-toggle"))
    await user.click(screen.getByTestId("settings-problem-reports-save"))

    expect(updateProblemReportSettings).toHaveBeenCalledWith({ enabled: false })
  })

  it("keeps the form open with the error when the save is refused", async () => {
    const user = userEvent.setup()
    jest.mocked(updateProblemReportSettings).mockResolvedValue({ success: false, code: "INTERNAL", error: "Could not save the problem report settings" })
    await renderPage()

    await user.click(screen.getByTestId("settings-problem-reports-edit"))
    await user.click(screen.getByTestId("admin-problem-reports-enabled-toggle"))
    await user.click(screen.getByTestId("settings-problem-reports-save"))

    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("Could not save the problem report settings"))
    expect(screen.getByTestId("admin-problem-reports-enabled-toggle")).toBeInTheDocument()
  })
})
