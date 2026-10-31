/**
 * The audit log page: its own `audit:read` check before any read, the URL's
 * filters, page and page size handed to the loader, then the header, the
 * scope chips and the table on the page the loader settled on.
 */

import { render, screen, within } from "@testing-library/react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import AuditLogPage from "@/app/admin/audit/page"
import { assertPermission } from "@/lib/admin"
import { type AuditLogPage as AuditLogPageData, getAuditLogPage } from "@/lib/data/audit-log"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/lib/admin", () => ({ assertPermission: jest.fn() }))
jest.mock("@/lib/data/audit-log", () => ({ getAuditLogPage: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({
  getFormat: async () => (await import("@/lib/utils/format")).bindFormat({ timeZone: "America/Chicago", locale: "en-US" }),
}))

const DATA: AuditLogPageData = {
  rows: [
    {
      id: "e1",
      type: "MEMBER_UNSHARED",
      label: "Plex access removed",
      category: "access",
      createdAt: new Date("2026-10-30T15:00:00Z"),
      actor: { id: "system", kind: "system", name: "System" },
      member: { id: "jane", kind: "user", name: "Jane Doe" },
      summary: "Removed for inactivity, never seen",
    },
  ],
  total: 1,
  page: 1,
  scope: { actor: null, member: null },
}

async function renderPage(query: Record<string, string> = {}) {
  resetUrl(`/admin/audit${Object.keys(query).length ? `?${new URLSearchParams(query)}` : ""}`)
  render(await AuditLogPage({ searchParams: Promise.resolve(query) }))
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(assertPermission).mockResolvedValue({ user: { id: "support-1", isAdmin: false, role: "support" }, expires: "" } as never)
  jest.mocked(getAuditLogPage).mockResolvedValue(DATA)
})

describe("Admin audit log page", () => {
  it("checks audit:read before reading anything", async () => {
    jest.mocked(assertPermission).mockRejectedValue(Object.assign(new Error("Admin access required"), { digest: "PM_FORBIDDEN" }))

    await expect(AuditLogPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(assertPermission).toHaveBeenCalledWith("audit:read")
    expect(getAuditLogPage).not.toHaveBeenCalled()
  })

  it("hands the URL's filters, page and page size to the loader, with the server zone", async () => {
    await renderPage({ category: "access", type: "MEMBER_UNSHARED", actor: "system", member: "jane", run: "run-1", from: "2026-10-01", to: "2026-10-31", page: "2", pageSize: "50" })

    const [filters, options] = jest.mocked(getAuditLogPage).mock.calls[0]
    expect(filters).toEqual({
      category: "access",
      type: "MEMBER_UNSHARED",
      actor: "system",
      member: "jane",
      run: "run-1",
      range: { from: "2026-10-01", to: "2026-10-31" },
    })
    expect(options).toMatchObject({ page: 2, pageSize: 50 })
    expect(options.f.settings.timeZone).toBe("America/Chicago")
  })

  it("reads every filter it does not know as unset, from page 1", async () => {
    await renderPage({ category: "secrets", type: "TEST", actor: "jane doe", page: "zero", pageSize: "7" })

    expect(getAuditLogPage).toHaveBeenCalledWith({ range: null }, expect.objectContaining({ page: 1, pageSize: 25 }))
  })

  it("shows the header and the events, each name scoping the log", async () => {
    await renderPage()

    expect(screen.getByRole("heading", { level: 1, name: "Audit log" })).toBeInTheDocument()
    const row = screen.getByTestId("admin-audit-row-e1")
    expect(row).toHaveTextContent("Plex access removed")
    expect(row).toHaveTextContent("Plex and Jellyfin access")
    expect(row).toHaveTextContent("Removed for inactivity, never seen")
    expect(within(row).getByTestId("admin-audit-link-e1")).toHaveAttribute("href", "/admin/audit/e1")
    expect(within(row).getByTestId("admin-audit-actor-e1")).toHaveAttribute("href", "/admin/audit?actor=system")
    expect(within(row).getByTestId("admin-audit-member-e1")).toHaveAttribute("href", "/admin/audit?member=jane")
    expect(screen.queryByTestId("admin-audit-scope")).not.toBeInTheDocument()
  })

  it("shows what the log is scoped to", async () => {
    jest.mocked(getAuditLogPage).mockResolvedValue({ ...DATA, scope: { actor: null, member: { id: "jane", kind: "user", name: "Jane Doe" } } })

    await renderPage({ member: "jane", run: "run-1" })

    expect(screen.getByTestId("admin-audit-scope-member")).toHaveTextContent("Involving Jane Doe")
    expect(screen.getByTestId("admin-audit-scope-run")).toHaveTextContent("One inactivity run")
    expect(screen.getByTestId("admin-audit-scope-member-clear")).toHaveAttribute("href", "/admin/audit?run=run-1")
  })

  it("shows the page the loader settled on, past the end", async () => {
    jest.mocked(getAuditLogPage).mockResolvedValue({ ...DATA, total: 60, page: 3 })

    await renderPage({ page: "9" })

    expect(screen.getByTestId("admin-audit-pagination-info")).toHaveTextContent("Showing 51 to 60 of 60 events")
  })

  it("says nothing has been recorded yet when no filter is set", async () => {
    jest.mocked(getAuditLogPage).mockResolvedValue({ ...DATA, rows: [], total: 0 })

    await renderPage()
    expect(screen.getByTestId("admin-audit-empty")).toHaveTextContent("No events yet")
  })

  it("offers to clear the filters when none of the events match", async () => {
    jest.mocked(getAuditLogPage).mockResolvedValue({ ...DATA, rows: [], total: 0 })

    await renderPage({ from: "2026-10-01", to: "2026-10-02" })
    expect(screen.getByTestId("admin-audit-empty-filtered")).toHaveTextContent("No events match these filters")
  })
})
