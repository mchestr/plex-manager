/**
 * One problem report: a 404 for an unknown id, the facts with the reporter's
 * page and the Plex link, the members' words as plain text, the evidence,
 * Mark fixed and Close with a note only while it is open, and the notes it
 * was closed with.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { resolveProblemReport } from "@/actions/admin/problem-reports"
import ProblemReportPage from "@/app/admin/(automations)/problem-reports/[id]/page"
import { assertAdmin } from "@/lib/admin"
import { getProblemReport, type ProblemReportDetail } from "@/lib/data/problem-reports"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/data/problem-reports", () => ({ getProblemReport: jest.fn() }))
jest.mock("@/actions/admin/problem-reports", () => ({ resolveProblemReport: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({
  getFormat: async () => (await import("@/lib/utils/format")).bindFormat({ timeZone: "America/Chicago", locale: "en-US" }),
}))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const AT = new Date("2026-11-08T20:00:00.000Z")
const REPORT: ProblemReportDetail = {
  id: "r1",
  title: "Heat (1995)",
  mediaType: "MOVIE",
  problem: "Won't start",
  note: "**Never** plays [here](https://evil.example)",
  status: "WITH_ADMIN",
  open: true,
  reporter: { id: "m1", name: "Jane" },
  createdAt: AT,
  resolvedAt: null,
  memberNote: null,
  adminNote: null,
  plexHref: "https://app.plex.tv/desktop/#!/server/abc/details?key=%2Flibrary%2Fmetadata%2F555",
  fixes: { suggested: null, others: ["REFRESH"] },
  running: null,
  steps: [
    {
      id: "e1",
      at: AT,
      words: "Reported: Won't start",
      actor: { id: "m1", name: "Jane" },
      note: null,
      device: "Nothing plays on their player",
      evidence: { lastPlay: { player: "Living Room", transcoded: true, at: AT }, playedToEnd: false },
    },
    { id: "e2", at: AT, words: "Following", actor: { id: "m2", name: "Sam" }, note: null, device: null, evidence: null },
    {
      id: "e3",
      at: AT,
      words: "Also reported: Stops or freezes partway",
      actor: null,
      note: "Freezes at 40 minutes",
      device: null,
      evidence: { lastPlay: { player: null, transcoded: false, at: AT }, playedToEnd: true },
    },
  ],
}

const renderPage = async () => render(await ProblemReportPage({ params: Promise.resolve({ id: "r1" }) }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getProblemReport).mockResolvedValue(REPORT)
  jest.mocked(resolveProblemReport).mockResolvedValue({ success: true, data: null })
})

describe("ProblemReportPage", () => {
  it("checks the admin before reading anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValueOnce(new Error("PM_FORBIDDEN"))

    await expect(renderPage()).rejects.toThrow("PM_FORBIDDEN")
    expect(getProblemReport).not.toHaveBeenCalled()
  })

  it("is a 404 for a report that isn't there", async () => {
    jest.mocked(getProblemReport).mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND")
  })

  it("shows the report, its reporter's page and the title in Plex", async () => {
    await renderPage()

    expect(screen.getByRole("heading", { level: 1, name: "Heat (1995)" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-problem-report-status")).toHaveTextContent("With the server admin")
    expect(screen.getByTestId("admin-problem-report-reporter")).toHaveAttribute("href", "/admin/users/m1")
    expect(screen.getByTestId("admin-problem-report-plex")).toHaveAttribute("href", REPORT.plexHref)
  })

  it("shows the member's note as plain text, never as Markdown", async () => {
    await renderPage()

    expect(screen.getByTestId("admin-problem-report-note")).toHaveTextContent("**Never** plays [here](https://evil.example)")
    expect(screen.queryByRole("link", { name: "here" })).not.toBeInTheDocument()
  })

  it("lists the steps with the player answer and what Tautulli said", async () => {
    await renderPage()

    const first = screen.getByTestId("admin-problem-report-step-e1")
    expect(within(first).getByText("Reported: Won't start")).toBeInTheDocument()
    expect(screen.getByTestId("admin-problem-report-step-e1-evidence")).toHaveTextContent(
      "Nothing plays on their playerTheir last play: Nov 8, 2026, 2:00 PM on Living Room, converted by PlexIt hasn't played to the end since its file was added"
    )
    expect(screen.getByTestId("admin-problem-report-step-e2-actor")).toHaveAttribute("href", "/admin/users/m2")
    expect(screen.queryByTestId("admin-problem-report-step-e2-evidence")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-problem-report-step-e3-note")).toHaveTextContent("Freezes at 40 minutes")
    expect(screen.queryByTestId("admin-problem-report-step-e3-actor")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-problem-report-step-e3-evidence")).toHaveTextContent(
      "Their last play: Nov 8, 2026, 2:00 PM on an unknown playerIt has played to the end since its file was added"
    )
  })

  it("closes the open report with the member's and the internal note", async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByTestId("admin-problem-report-closed"))
    await user.type(screen.getByTestId("admin-problem-report-closed-member-note"), "This is the only copy there is.")
    await user.type(screen.getByTestId("admin-problem-report-closed-admin-note"), "Checked the indexers")
    await user.click(screen.getByTestId("admin-problem-report-closed-confirm"))

    expect(resolveProblemReport).toHaveBeenCalledWith({
      reportId: "r1",
      outcome: "closed",
      memberNote: "This is the only copy there is.",
      adminNote: "Checked the indexers",
    })
  })

  it("marks it fixed from the primary button", async () => {
    const user = userEvent.setup()
    await renderPage()

    await user.click(screen.getByTestId("admin-problem-report-fixed"))
    await user.click(screen.getByTestId("admin-problem-report-fixed-confirm"))

    expect(resolveProblemReport).toHaveBeenCalledWith({ reportId: "r1", outcome: "fixed", memberNote: "", adminNote: "" })
  })

  it("offers neither once it is closed, and shows the notes it was closed with", async () => {
    jest.mocked(getProblemReport).mockResolvedValue({
      ...REPORT,
      status: "FIXED",
      open: false,
      resolvedAt: AT,
      memberNote: "Swapped the copy.",
      adminNote: "Old one was a cam",
      plexHref: null,
    })
    await renderPage()

    expect(screen.queryByTestId("admin-problem-report-fixed")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-problem-report-closed")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-problem-report-plex")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-problem-report-member-note")).toHaveTextContent("Swapped the copy.")
    expect(screen.getByTestId("admin-problem-report-admin-note")).toHaveTextContent("Old one was a cam")
    expect(screen.getByText("Fixed", { selector: "dt" })).toBeInTheDocument()
  })
})
