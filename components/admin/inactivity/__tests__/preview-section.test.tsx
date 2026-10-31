/**
 * Whom a run would remove: the threshold and the read the list stands on,
 * each member linked to their page with their last play, join day and last
 * activity, the empty states before and after a read, the warning when the
 * Plex shares could not be read, and the count of everyone left out.
 */

import { render, screen, within } from "@testing-library/react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import { PreviewSection } from "@/components/admin/inactivity/preview-section"
import type { InactivityPreview } from "@/lib/data/inactivity-preview"
import { bindFormat } from "@/lib/utils/format"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)

const f = bindFormat({ timeZone: "UTC", locale: "en-US" })
const NOW = new Date("2026-10-31T12:00:00Z").getTime()
const ON = { enabled: true, thresholdDays: 180 }
const NO_SKIPS = { no_plex: 0, admin: 0, owner: 0, role: 0, exempt: 0, paying: 0, excluded: 0, not_read: 0 }

const PREVIEW: InactivityPreview = {
  rows: [
    {
      id: "u-never",
      name: "Nia Never",
      lastSeenAt: null,
      lastActiveAt: new Date("2025-08-01T00:00:00Z"),
      createdAt: new Date("2025-08-01T00:00:00Z"),
    },
    {
      id: "u-seen",
      name: "Sam Seen",
      lastSeenAt: new Date("2026-03-03T20:00:00Z"),
      lastActiveAt: new Date("2026-03-03T20:00:00Z"),
      createdAt: new Date("2024-01-15T00:00:00Z"),
    },
  ],
  skips: NO_SKIPS,
  active: 0,
  noAccess: 0,
  shareCheck: null,
  scheduledLimit: 1,
  readSince: new Date("2026-10-31T02:17:00Z"),
}

function renderSection(preview: Partial<InactivityPreview> = {}, settings = ON) {
  render(<PreviewSection preview={{ ...PREVIEW, ...preview }} settings={settings} f={f} now={NOW} />)
}

/** Each cell's value, without the label a card shows above it. */
const cells = (id: string) =>
  within(screen.getByTestId(`admin-inactivity-preview-row-${id}`))
    .getAllByRole("cell")
    .map((cell) => cell.textContent?.replace(cell.querySelector('[data-slot="cell-label"]')?.textContent ?? "", ""))

beforeEach(() => resetUrl("/admin/inactivity"))

describe("PreviewSection", () => {
  it("lists each member with their page, last play, join day and last activity, under the threshold and the read", () => {
    renderSection()

    expect(screen.getByRole("heading", { level: 2, name: "Who a run would remove" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-inactivity-preview-section")).toHaveTextContent(
      "Members with access and no play in 180 days, the longest inactive first. From the Tautulli read on Oct 31, 2026, 2:17 AM UTC."
    )
    expect(screen.getByTestId("admin-inactivity-read-timestamp")).toHaveTextContent("Oct 31, 2026, 2:17 AM UTC")
    expect(screen.getByRole("table", { name: "Members a run would remove" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-inactivity-member-u-seen")).toHaveAttribute("href", "/admin/users/u-seen")
    expect(cells("u-never")).toEqual(["Nia Never", "Never", "Aug 1, 2025", "last year"])
    expect(cells("u-seen")).toEqual(["Sam Seen", "Mar 3, 2026", "Jan 15, 2024", "7 months ago"])
    expect(screen.getByTestId("admin-inactivity-last-seen-u-seen-timestamp")).toHaveAttribute("dateTime", "2026-03-03T20:00:00.000Z")
    expect(screen.getByTestId("admin-inactivity-joined-u-never-timestamp")).toHaveAttribute("dateTime", "2025-08-01T00:00:00.000Z")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-inactivity-not-listed")).not.toBeInTheDocument()
  })

  it("says no run removes them while automatic removal is off", () => {
    renderSection({}, { enabled: false, thresholdDays: 90 })

    expect(screen.getByTestId("admin-inactivity-preview-section")).toHaveTextContent(
      /no play in 90 days, the longest inactive first\. From the Tautulli read on .+\. Automatic removal is off, so no run removes them\./
    )
  })

  it("says Tautulli has not been read before the first read", () => {
    renderSection({ rows: [], readSince: null })

    expect(screen.queryByTestId("admin-inactivity-read-timestamp")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-inactivity-preview-unread")).toHaveTextContent("Tautulli has not been read yet")
    expect(screen.queryByRole("table")).not.toBeInTheDocument()
  })

  it("says no one is inactive after a read", () => {
    renderSection({ rows: [] })

    expect(screen.getByTestId("admin-inactivity-preview-empty")).toHaveTextContent("No inactive members")
  })

  it.each([
    ["no_plex_server", "No Plex server is set up"],
    ["plex_unavailable", "Plex did not answer"],
    ["plex_auth", "Plex refused the server token"],
  ] as const)("warns that the list can hold members without access when %s", (shareCheck, title) => {
    renderSection({ shareCheck })

    const alert = screen.getByTestId("admin-inactivity-share-check")
    expect(alert).toHaveTextContent(title)
    expect(alert).toHaveTextContent("The list can include members who no longer have access. Runs remove no one until this is fixed.")
  })

  it("counts everyone left out by why, leaving out the reasons no one has", () => {
    renderSection({ active: 85, noAccess: 3, skips: { ...NO_SKIPS, admin: 2, paying: 5, not_read: 12 } })

    const notListed = screen.getByTestId("admin-inactivity-not-listed")
    expect(within(notListed).getByRole("heading", { level: 3, name: "Not in this list" })).toBeInTheDocument()
    const counts = within(notListed)
      .getAllByRole("term")
      .map((term) => `${term.textContent}: ${term.nextElementSibling?.textContent}`)
    expect(counts).toEqual([
      "Played or joined in the last 180 days: 85",
      "Admin: 2",
      "Paying member: 5",
      "Not found in Tautulli: 12",
      "No access to the server: 3",
    ])
    expect(screen.getByTestId("admin-inactivity-not-listed-not_read")).toHaveTextContent("12")
  })
})
