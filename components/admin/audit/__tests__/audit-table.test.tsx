/**
 * The audit log table: each row's time, event, sides and summary, names that
 * scope the log while keeping the other filters, the Category and Event
 * filters in the URL, and the first-use and filtered empty states.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { AuditTable } from "@/components/admin/audit/audit-table"
import { AUDIT_EVENT_NAMES } from "@/lib/audit/events"
import type { AuditRow } from "@/lib/data/audit-log"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)

const row = (id: string, overrides: Partial<AuditRow> = {}): AuditRow => ({
  id,
  type: "MEMBER_UNSHARED",
  label: "Plex access removed",
  category: "access",
  createdAt: new Date("2026-10-30T15:00:00Z"),
  actor: { id: "admin-1", kind: "user", name: "Alex Admin" },
  member: { id: "jane", kind: "user", name: "Jane Doe" },
  summary: "Share removed",
  ...overrides,
})

const ROWS = [
  row("e1"),
  row("e2", {
    type: "TEST",
    label: "TEST",
    category: null,
    actor: { id: "system", kind: "system", name: "System" },
    member: null,
    summary: null,
  }),
]

function renderTable(props: Partial<Parameters<typeof AuditTable>[0]> = {}) {
  return render(
    <AuditTable rows={ROWS} total={ROWS.length} page={1} pageSize={25} category={null} type={null} filtered={false} zone="UTC" {...props} />
  )
}

beforeEach(() => resetUrl("/admin/audit"))

describe("AuditTable", () => {
  it("shows each event's time, words, sides and summary, the time opening the event", () => {
    renderTable()

    const unshared = screen.getByTestId("admin-audit-row-e1")
    expect(within(unshared).getByTestId("admin-audit-link-e1")).toHaveAttribute("href", "/admin/audit/e1")
    expect(within(unshared).getByTestId("admin-audit-time-e1-timestamp")).toHaveAttribute("dateTime", "2026-10-30T15:00:00.000Z")
    expect(unshared).toHaveTextContent("Plex access removed")
    expect(unshared).toHaveTextContent("Plex and Jellyfin access")
    expect(unshared).toHaveTextContent("Share removed")
    expect(within(unshared).getByTestId("admin-audit-actor-e1")).toHaveAccessibleName("Events by Alex Admin")
    expect(within(unshared).getByTestId("admin-audit-member-e1")).toHaveAccessibleName("Events involving Jane Doe")
  })

  it("names a job as System, and dashes a missing member and summary", () => {
    renderTable()

    const job = screen.getByTestId("admin-audit-row-e2")
    expect(within(job).getByTestId("admin-audit-actor-e2")).toHaveTextContent("System")
    expect(within(job).getByTestId("admin-audit-actor-e2")).toHaveAttribute("href", "/admin/audit?actor=system")
    expect(within(job).queryByTestId("admin-audit-member-e2")).not.toBeInTheDocument()
    expect(within(job).getAllByText("–")).toHaveLength(2)
  })

  it("scopes the log to a name, keeping the other filters and going back to page 1", () => {
    resetUrl("/admin/audit?category=access&from=2026-10-01&to=2026-10-31&page=3&pageSize=50")
    renderTable()

    expect(screen.getByTestId("admin-audit-actor-e1")).toHaveAttribute(
      "href",
      "/admin/audit?category=access&from=2026-10-01&to=2026-10-31&pageSize=50&actor=admin-1"
    )
    expect(screen.getByTestId("admin-audit-member-e1")).toHaveAttribute(
      "href",
      "/admin/audit?category=access&from=2026-10-01&to=2026-10-31&pageSize=50&member=jane"
    )
  })

  it("filters by category through the URL", async () => {
    renderTable()
    const user = userEvent.setup()

    await user.click(screen.getByTestId("admin-audit-filters-filter-category"))
    const options = await screen.findAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual([
      "All",
      "Members and roles",
      "Plex and Jellyfin access",
      "Sign-in sessions",
      "Invites",
      "Affiliates",
      "Billing",
      "Rewind",
      "Assistant",
      "API access",
      "Discord",
      "Announcements",
      "Job queues",
      "Settings",
      "First-run setup",
      "Admin reads",
    ])
    await user.click(screen.getByTestId("admin-audit-filters-filter-category-option-access"))

    expect(currentHref()).toBe("/admin/audit?category=access")
    expect(await screen.findByTestId("admin-audit-filters-chip-category")).toHaveTextContent("Category: Plex and Jellyfin access")
  })

  it("offers every event by label, or only the chosen category's", async () => {
    const user = userEvent.setup()
    const { unmount } = renderTable()

    await user.click(screen.getByTestId("admin-audit-filters-filter-type"))
    const every = await screen.findAllByRole("option")
    expect(every).toHaveLength(AUDIT_EVENT_NAMES.length + 1)
    const labels = every.slice(1).map((option) => option.textContent ?? "")
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "en")))
    unmount()

    resetUrl("/admin/audit?category=reads")
    renderTable({ category: "reads" })
    await user.click(screen.getByTestId("admin-audit-filters-filter-type"))
    expect((await screen.findAllByRole("option")).map((option) => option.textContent)).toEqual([
      "All",
      "Assistant read app data",
      "Audit log opened",
      "Member's content opened",
      "Member's Rewind opened",
      "Members' content listed",
    ])
    await user.click(screen.getByTestId("admin-audit-filters-filter-type-option-AUDIT_LOG_VIEWED"))
    expect(currentHref()).toBe("/admin/audit?category=reads&type=AUDIT_LOG_VIEWED")
  })

  it("keeps the chosen event among the options when it is in another category", async () => {
    resetUrl("/admin/audit?category=reads&type=MEMBER_UNSHARED")
    renderTable({ category: "reads", type: "MEMBER_UNSHARED", filtered: true })

    expect(screen.getByTestId("admin-audit-filters-chip-type")).toHaveTextContent("Event: Plex access removed")
    await userEvent.setup().click(screen.getByTestId("admin-audit-filters-filter-type"))
    expect(await screen.findByTestId("admin-audit-filters-filter-type-option-MEMBER_UNSHARED")).toBeInTheDocument()
  })

  it("has a date filter and counts the matching events", () => {
    renderTable({ total: 140 })

    expect(screen.getByTestId("admin-audit-dates")).toBeInTheDocument()
    expect(screen.getByTestId("admin-audit-filters-count")).toHaveTextContent("140 events")
  })

  it("says no events are recorded yet when nothing is filtered", () => {
    renderTable({ rows: [], total: 0 })

    expect(screen.getByTestId("admin-audit-empty")).toHaveTextContent("No events yet")
    expect(screen.queryByTestId("admin-audit-empty-filtered")).not.toBeInTheDocument()
  })

  it("clears every filter, the scope and the dates from the filtered empty state", async () => {
    resetUrl("/admin/audit?category=billing&type=SUBSCRIPTION_CANCELED&actor=a1&member=m1&run=r1&from=2026-10-01&to=2026-10-02&page=2&pageSize=50")
    renderTable({ rows: [], total: 0, category: "billing", type: "SUBSCRIPTION_CANCELED", filtered: true })

    const empty = screen.getByTestId("admin-audit-empty-filtered")
    expect(empty).toHaveTextContent("No events match these filters")
    await userEvent.setup().click(within(empty).getByTestId("admin-audit-clear-filters"))
    expect(currentHref()).toBe("/admin/audit?pageSize=50")
  })
})
