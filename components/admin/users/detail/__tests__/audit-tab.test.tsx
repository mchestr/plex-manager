/**
 * The member's Audit tab: their latest events, each opening its event page and
 * saying whether they acted or it was about them, the empty state, and the
 * audit log scoped to them.
 */

import { render, screen, within } from "@testing-library/react"

import { AuditTab } from "@/components/admin/users/detail/audit-tab"
import { getMemberAuditEvents, type MemberAuditRow } from "@/lib/data/audit-log"
import { bindFormat } from "@/lib/utils/format"

jest.mock("@/lib/data/audit-log", () => ({ getMemberAuditEvents: jest.fn() }))

const f = bindFormat({ timeZone: "America/Chicago", locale: "en-US" })
const JANE = { id: "jane", kind: "user", name: "Jane Doe" } as const

const row = (id: string, overrides: Partial<MemberAuditRow> = {}): MemberAuditRow => ({
  id,
  type: "MEMBER_UNSHARED",
  label: "Plex access removed",
  category: "access",
  createdAt: new Date("2026-10-30T15:00:00Z"),
  actor: { id: "system", kind: "system", name: "System" },
  member: JANE,
  summary: "Removed for inactivity, never seen",
  role: "subject",
  ...overrides,
})

async function renderTab(rows: MemberAuditRow[], total = rows.length) {
  jest.mocked(getMemberAuditEvents).mockResolvedValue({ rows, total })
  return render(await AuditTab({ userId: "jane", f }))
}

describe("AuditTab", () => {
  it("reads the member's latest 20 events", async () => {
    await renderTab([])

    expect(getMemberAuditEvents).toHaveBeenCalledWith("jane", { limit: 20, f })
  })

  it("lists each event with its time, words, the member's part and the summary", async () => {
    await renderTab([
      row("e1"),
      row("e2", { type: "AFFILIATE_APPLIED", label: "Applied to be an affiliate", actor: JANE, member: null, summary: null, role: "actor" }),
      row("e3", { type: "USER_ROLE_CHANGED", label: "Role changed", actor: JANE, member: { id: "sam", kind: "user", name: "Sam" }, role: "actor" }),
      row("e4", { type: "USER_CREATED", label: "Account created", actor: JANE, member: JANE, summary: null, role: "actor" }),
    ])

    const removal = screen.getByTestId("admin-user-audit-row-e1")
    expect(within(removal).getByTestId("admin-user-audit-e1-timestamp")).toHaveAttribute("href", "/admin/audit/e1")
    expect(within(removal).getByTestId("admin-user-audit-e1-timestamp")).toHaveTextContent("Oct 30, 2026, 10:00 AM CDT")
    expect(removal).toHaveTextContent("Plex access removed")
    expect(removal).toHaveTextContent("About them, by System")
    expect(removal).toHaveTextContent("Removed for inactivity, never seen")

    expect(screen.getByTestId("admin-user-audit-row-e2")).toHaveTextContent("By them")
    expect(screen.getByTestId("admin-user-audit-row-e2")).toHaveTextContent("–")
    expect(screen.getByTestId("admin-user-audit-row-e3")).toHaveTextContent("By them, about Sam")
    expect(screen.getByTestId("admin-user-audit-row-e4")).toHaveTextContent("Account createdBy them")
    expect(screen.queryByTestId("admin-user-audit-more")).not.toBeInTheDocument()
  })

  it("opens the audit log scoped to the member", async () => {
    await renderTab([row("e1")])

    expect(screen.getByTestId("admin-user-audit-open-log")).toHaveAttribute("href", "/admin/audit?member=jane")
  })

  it("says how many more events the audit log has", async () => {
    await renderTab([row("e1")], 1200)

    expect(screen.getByTestId("admin-user-audit-more")).toHaveTextContent("The latest 1 of 1,200 events.")
  })

  it("says when there is nothing yet", async () => {
    await renderTab([])

    expect(screen.getByTestId("admin-user-audit-empty")).toHaveTextContent("No audit events by or about this member yet.")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })
})
