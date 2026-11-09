/**
 * The warning email lists: who waits for their date with their newest email
 * and its status, who the next run warns first with the date it names, who
 * of them the app cannot email (a reason, never an address), the line each
 * empty list shows, and the state line: a projection while warnings or
 * automatic removal are off, and a note when the Plex shares were not read.
 */

import { render, screen, within } from "@testing-library/react"

import { resetUrl } from "@/__tests__/helpers/url-router"
import { WarningLists } from "@/components/admin/inactivity/warning-lists"
import type { InactivityPreview } from "@/lib/data/inactivity-preview"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)

const NOW = new Date("2026-10-31T12:00:00Z").getTime()

const PREVIEW: InactivityPreview = {
  rows: [],
  skips: { no_plex: 0, admin: 0, owner: 0, role: 0, paying: 0, excluded: 0, not_read: 0 },
  active: 0,
  noAccess: 0,
  held: 0,
  unwarned: 0,
  shareCheck: null,
  scheduledLimit: 1,
  readSince: new Date("2026-10-31T02:17:00Z"),
  warningsOn: false,
  waiting: [
    {
      id: "u-wait",
      name: "Wes Waiting",
      removalDay: "2026-11-20",
      last: { leadDays: 7, lastWarning: false, status: "sent", code: null, at: new Date("2026-11-13T14:00:00Z") },
    },
    {
      id: "u-skip",
      name: "Sky Skipped",
      removalDay: "2026-11-21",
      last: { leadDays: 1, lastWarning: true, status: "skipped", code: "rejected", at: new Date("2026-11-20T14:00:00Z") },
    },
    { id: "u-none", name: "Nell None", removalDay: "2026-11-22", last: null },
  ],
  firstWarnings: [{ id: "u-first", name: "Fay First", removalDay: "2026-12-01", lastActiveAt: new Date("2025-08-01T00:00:00Z") }],
  cannotEmail: [
    { id: "u-skip", name: "Sky Skipped", code: "rejected", list: "waiting" },
    { id: "u-first", name: "Fay First", code: "email_unconfirmed", list: "first" },
  ],
  failedWarnings: [],
}

/** Each cell's value, without the label a card shows above it. */
const cells = (table: string, id: string) =>
  within(screen.getByTestId(`admin-inactivity-${table}-row-${id}`))
    .getAllByRole("cell")
    .map((cell) => cell.textContent?.replace(cell.querySelector('[data-slot="cell-label"]')?.textContent ?? "", ""))

beforeEach(() => resetUrl("/admin/inactivity"))

describe("WarningLists", () => {
  it("lists the waiting members with their date, newest email and its status", () => {
    render(<WarningLists preview={PREVIEW} removalOn now={NOW} />)

    expect(screen.getByRole("heading", { level: 2, name: "Warned members" })).toBeInTheDocument()
    expect(screen.getByRole("table", { name: "Members waiting for their removal date" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-inactivity-waiting-member-u-wait")).toHaveAttribute("href", "/admin/users/u-wait")
    expect(cells("waiting", "u-wait")).toEqual(["Wes Waiting", "Nov 20, 2026", "7-day warningNov 13, 2026", "Sent"])
    expect(screen.getByTestId("admin-inactivity-waiting-date-u-wait")).toHaveAttribute("dateTime", "2026-11-20")
    expect(cells("waiting", "u-skip")).toEqual(["Sky Skipped", "Nov 21, 2026", "Last warningNov 20, 2026", "Skipped (rejected)"])
    expect(cells("waiting", "u-none")).toEqual(["Nell None", "Nov 22, 2026", "None", "None"])
  })

  it("lists the first warnings of the next run with the date they name", () => {
    render(<WarningLists preview={PREVIEW} removalOn now={NOW} />)

    expect(screen.getByRole("table", { name: "Members the next run warns first" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-inactivity-first-member-u-first")).toHaveAttribute("href", "/admin/users/u-first")
    expect(cells("first", "u-first")).toEqual(["Fay First", "Dec 1, 2026", "last year"])
  })

  it("names why the app cannot email each member, and from which list", () => {
    render(<WarningLists preview={PREVIEW} removalOn now={NOW} />)

    expect(screen.getByRole("table", { name: "Members the app cannot email" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-inactivity-cannot-email-member-u-first")).toHaveAttribute("href", "/admin/users/u-first")
    expect(screen.getByTestId("admin-inactivity-cannot-email-reason-u-first")).toHaveTextContent("Not the plex.tv address")
    expect(cells("cannot-email", "u-first")).toEqual(["Fay First", "Not the plex.tv addressemail_unconfirmed", "First warning at the next run"])
    expect(cells("cannot-email", "u-skip")).toEqual(["Sky Skipped", "Refused by the mail serverrejected", "Waiting for their date"])
    expect(screen.getByTestId("admin-inactivity-warnings")).not.toHaveTextContent("@")
  })

  it("says the lists are a projection while warnings are off, and what runs do while on", () => {
    const { rerender } = render(<WarningLists preview={PREVIEW} removalOn now={NOW} />)
    const state = screen.getByTestId("admin-inactivity-warnings-state")
    expect(state).toHaveTextContent(
      /^Warning emails are off\. The lists below show who the first run after you turn them on would warn, and who it cannot email\.$/
    )

    rerender(<WarningLists preview={{ ...PREVIEW, warningsOn: true }} removalOn now={NOW} />)
    expect(state).toHaveTextContent(/^Each run emails members before it removes them, and removes a member only after their last warning\.$/)
  })

  it("says no run warns anyone while automatic removal is off, with warnings on or off", () => {
    const { rerender } = render(<WarningLists preview={{ ...PREVIEW, warningsOn: true }} removalOn={false} now={NOW} />)
    const state = screen.getByTestId("admin-inactivity-warnings-state")
    expect(state).toHaveTextContent(
      /^Automatic removal is off, so no run sends warnings or removes anyone\. The lists below show who the first run after you turn it on would warn, and who it cannot email\.$/
    )
    expect(state).not.toHaveTextContent("Each run emails")

    rerender(<WarningLists preview={PREVIEW} removalOn={false} now={NOW} />)
    expect(state).toHaveTextContent(
      /^Warning emails are off\. Automatic removal is off too, so no run sends warnings or removes anyone\. The lists below show who the first run after you turn both on would warn, and who it cannot email\.$/
    )
  })

  it("says the lists can hold members without access when the Plex shares were not read", () => {
    render(<WarningLists preview={{ ...PREVIEW, warningsOn: true, shareCheck: "plex_unavailable" }} removalOn now={NOW} />)

    expect(screen.getByTestId("admin-inactivity-warnings-state")).toHaveTextContent(
      "removes a member only after their last warning. The Plex shares could not be read, so the lists can include members who no longer have access, and runs send no warnings until this is fixed."
    )
  })

  it("says so in a line when a list is empty", () => {
    render(<WarningLists preview={{ ...PREVIEW, waiting: [], firstWarnings: [], cannotEmail: [] }} removalOn now={NOW} />)

    expect(screen.queryByRole("table")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-inactivity-waiting-none")).toHaveTextContent("No member has an open warning.")
    expect(screen.getByTestId("admin-inactivity-first-none")).toHaveTextContent("The next run warns no one for the first time.")
    expect(screen.getByTestId("admin-inactivity-cannot-email-none")).toHaveTextContent("The app can email every member in the two lists above.")
  })
})
