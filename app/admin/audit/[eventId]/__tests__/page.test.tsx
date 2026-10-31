/**
 * One audit event's page: its own `audit:read` check, the event's time, words,
 * sides and summary, names that scope the log (and, for an admin, open the
 * member), and the stored details for admins only.
 */

import { render, screen, within } from "@testing-library/react"

import AuditEventPage from "@/app/admin/audit/[eventId]/page"
import { assertPermission } from "@/lib/admin"
import { type AuditEventView, getAuditEvent } from "@/lib/data/audit-log"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/lib/admin", () => ({ assertPermission: jest.fn() }))
jest.mock("@/lib/data/audit-log", () => ({ getAuditEvent: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({
  getFormat: async () => (await import("@/lib/utils/format")).bindFormat({ timeZone: "America/Chicago", locale: "en-US" }),
}))

const EVENT: AuditEventView = {
  id: "e1",
  type: "MEMBER_UNSHARED",
  label: "Plex access removed",
  category: "access",
  createdAt: new Date("2026-10-30T15:00:00Z"),
  actor: { id: "admin-1", kind: "user", name: "Alex Admin" },
  member: { id: "jane", kind: "user", name: "Jane Doe" },
  summary: "Removed for inactivity, never seen",
  details: { status: "removed", reason: "inactivity", lastSeenAt: null, thresholdDays: 180 },
  detailsHidden: false,
}

const as = (isAdmin: boolean) =>
  jest.mocked(assertPermission).mockResolvedValue({ user: { id: "viewer", isAdmin, role: isAdmin ? null : "support" }, expires: "" } as never)

async function renderPage(event: AuditEventView = EVENT) {
  jest.mocked(getAuditEvent).mockResolvedValue(event)
  return render(await AuditEventPage({ params: Promise.resolve({ eventId: "e1" }) }))
}

beforeEach(() => {
  jest.clearAllMocks()
  as(true)
})

describe("Admin audit event page", () => {
  it("checks audit:read before reading the event", async () => {
    jest.mocked(assertPermission).mockRejectedValue(Object.assign(new Error("Admin access required"), { digest: "PM_FORBIDDEN" }))

    await expect(AuditEventPage({ params: Promise.resolve({ eventId: "e1" }) })).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(assertPermission).toHaveBeenCalledWith("audit:read")
    expect(getAuditEvent).not.toHaveBeenCalled()
  })

  it("is a 404 for an event that does not exist", async () => {
    jest.mocked(getAuditEvent).mockResolvedValue(null)

    await expect(AuditEventPage({ params: Promise.resolve({ eventId: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND")
    expect(getAuditEvent).toHaveBeenCalledWith("missing", expect.objectContaining({ settings: expect.anything() }))
  })

  it("shows when, what, who, about whom and the summary", async () => {
    await renderPage()

    expect(screen.getByRole("heading", { level: 1, name: "Plex access removed" })).toBeInTheDocument()
    expect(within(screen.getByTestId("admin-audit-event-header")).getByRole("link", { name: "Audit log" })).toHaveAttribute("href", "/admin/audit")
    expect(screen.getByTestId("admin-audit-event-timestamp")).toHaveTextContent("Oct 30, 2026, 10:00 AM CDT")
    expect(screen.getByTestId("admin-audit-event-type")).toHaveTextContent("Plex access removedMEMBER_UNSHARED")
    expect(screen.getByTestId("admin-audit-event-category")).toHaveTextContent("Plex and Jellyfin access")
    expect(screen.getByTestId("admin-audit-event-summary")).toHaveTextContent("Removed for inactivity, never seen")
  })

  it("links a name to the log scoped to them, and for an admin to the member too", async () => {
    await renderPage()

    expect(screen.getByTestId("admin-audit-event-actor")).toHaveAttribute("href", "/admin/audit?actor=admin-1")
    expect(screen.getByTestId("admin-audit-event-actor")).toHaveAccessibleName("Events by Alex Admin")
    expect(screen.getByTestId("admin-audit-event-member")).toHaveAttribute("href", "/admin/audit?member=jane")
    expect(screen.getByTestId("admin-audit-event-member")).toHaveAccessibleName("Events involving Jane Doe")
    expect(screen.getByTestId("admin-audit-event-actor-profile")).toHaveAttribute("href", "/admin/users/admin-1")
    expect(screen.getByTestId("admin-audit-event-member-profile")).toHaveAttribute("href", "/admin/users/jane")
  })

  it("shows an admin every stored detail as plain text", async () => {
    await renderPage({ ...EVENT, details: { status: "removed", lastSeenAt: null, counts: { removed: 2 }, html: "<b>bold</b>" } })

    const details = screen.getByTestId("admin-audit-event-details")
    expect(within(details).getAllByRole("term").map((term) => term.textContent)).toEqual(["status", "lastSeenAt", "counts", "html"])
    expect(details).toHaveTextContent("removed")
    expect(details).toHaveTextContent("null")
    expect(within(details).getByText(/"removed": 2/)).toBeInTheDocument()
    expect(within(details).getByText("<b>bold</b>")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-audit-event-details-hidden")).not.toBeInTheDocument()
  })

  it("says when an event has no stored details", async () => {
    const { unmount } = await renderPage({ ...EVENT, details: null })
    expect(screen.getByTestId("admin-audit-event-details-empty")).toHaveTextContent("This event has no stored details.")
    unmount()

    await renderPage({ ...EVENT, details: {} })
    expect(screen.getByTestId("admin-audit-event-details-empty")).toBeInTheDocument()
  })

  it("shows details that are not an object as they are", async () => {
    await renderPage({ ...EVENT, details: ["removed", 2] })

    expect(screen.getByTestId("admin-audit-event-details")).toHaveTextContent('[ "removed", 2 ]')
  })

  it("tells Support the details exist, and offers no member page", async () => {
    as(false)

    await renderPage({ ...EVENT, details: null, detailsHidden: true })

    expect(screen.getByTestId("admin-audit-event-details-hidden")).toHaveTextContent("Only admins can see the stored details.")
    expect(screen.queryByTestId("admin-audit-event-details")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-audit-event-actor-profile")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-audit-event-member-profile")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-audit-event-actor")).toHaveAttribute("href", "/admin/audit?actor=admin-1")
  })

  it("offers no member page for System or a removed user, and dashes what is missing", async () => {
    await renderPage({
      ...EVENT,
      type: "TEST",
      label: "TEST",
      category: null,
      actor: { id: "system", kind: "system", name: "System" },
      member: null,
      summary: null,
    })

    expect(screen.getByTestId("admin-audit-event-actor")).toHaveTextContent("System")
    expect(screen.queryByTestId("admin-audit-event-actor-profile")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-audit-event-member")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-audit-event-category")).toHaveTextContent("–")
    expect(screen.getByTestId("admin-audit-event-summary")).toHaveTextContent("–")
  })
})
