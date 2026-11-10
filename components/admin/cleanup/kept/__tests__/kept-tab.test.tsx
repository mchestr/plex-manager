/**
 * The Kept and excluded tab (UX 4.8, 8.6, 8.7, 8.9, 10.2): the four tiles,
 * the heading, the FilterBar and table ids, the Protection, Until, Since and
 * Note cells, both empty states, the row actions of a Keep and of an
 * exclusion, and their three dialogs with their errors and toasts.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { currentHref, resetUrl } from "@/__tests__/helpers/url-router"
import { removeCleanupExclusion, removeCleanupKeep, setCleanupExclusionEnd } from "@/actions/admin/cleanup-protections"
import { KeptTab } from "@/components/admin/cleanup/kept/kept-tab"
import type { ProtectionRow } from "@/lib/cleanup/types/list-parts"
import type { CleanupProtectionsData } from "@/lib/cleanup/types/screens"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)
jest.mock("@/actions/admin/cleanup-protections", () => ({ removeCleanupKeep: jest.fn(), removeCleanupExclusion: jest.fn(), setCleanupExclusionEnd: jest.fn() }))
const mockShowSuccess = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: jest.fn() }) }))

const BASE = "admin-cleanup-kept"
const NOW = Date.parse("2026-11-08T12:00:00Z")

function row(id: string, overrides: Partial<ProtectionRow> = {}): ProtectionRow {
  return {
    itemKey: `movie:tmdb:${id}`, level: "movie", title: `Invented ${id}`, year: 2019, seasonNumber: null, episodeCount: null, seasonCount: null,
    posterKey: "5001", sectionId: "1", sizeBytes: null, id, kind: "keep", by: { id: "member-1", name: "Sam Rivera", isYou: false },
    until: "2027-02-06T12:00:00.000Z", since: "2026-11-08T09:00:00.000Z", note: null, ...overrides,
  }
}

const KEEP = row("keep-1", { level: "show", title: "Invented Show" })
const SEASON_KEEP = row("keep-2", { level: "season", title: "Invented Office", seasonNumber: 9 })
const EXCLUSION = row("exclusion-1", { kind: "exclude", by: { id: "admin-1", name: "Admin", isYou: true }, until: null, note: "Rewatch in spring" })
// An exclusion ends at the end of its day: midnight at the start of Jun 2 in UTC
const DATED = row("exclusion-2", { kind: "exclude", by: { id: "admin-2", name: "Alex Chen", isYou: false }, until: "2027-06-02T00:00:00.000Z" })

function data(overrides: Partial<CleanupProtectionsData> = {}): CleanupProtectionsData {
  return {
    tiles: { keeps: { count: 23, members: 9, keepDays: 90 }, excludes: { count: 8, withEnd: 3 }, keepForever: { count: 4 }, endingSoon: { count: 2 } },
    rows: [KEEP, SEASON_KEEP, EXCLUSION, DATED],
    total: 31,
    page: 1,
    size: 50,
    ...overrides,
  }
}

async function openAction(user: ReturnType<typeof userEvent.setup>, id: string, action: string) {
  await user.click(screen.getByTestId(`${BASE}-actions-${id}`))
  await user.click(await screen.findByTestId(`${BASE}-actions-${id}-${action}`))
}

beforeEach(() => {
  jest.clearAllMocks()
  resetUrl("/admin/cleanup?tab=kept")
  jest.spyOn(Date, "now").mockReturnValue(NOW)
  jest.mocked(removeCleanupKeep).mockResolvedValue({ success: true, data: null })
  jest.mocked(removeCleanupExclusion).mockResolvedValue({ success: true, data: null })
  jest.mocked(setCleanupExclusionEnd).mockResolvedValue({ success: true, data: null })
})

afterEach(() => jest.restoreAllMocks())

describe("KeptTab", () => {
  it("shows the four tiles with their words", () => {
    render(<KeptTab data={data()} />)
    const tiles = screen.getByTestId(`${BASE}-tiles`)
    expect(tiles).toHaveTextContent("Kept by members23titles9 members keep titles. A Keep lasts 90 days.")
    expect(tiles).toHaveTextContent("Excluded by you8titles3 have an end date")
    expect(tiles).toHaveTextContent("Keep forever marks4titlesFrom /mark in Discord. Members change them on Account.")
    expect(tiles).toHaveTextContent("Ending in 7 days2KeepsThey can join Leaving soon again with a new leave date")
  })

  it("uses the singular words for one", () => {
    const one = { keeps: { count: 1, members: 1, keepDays: 1 }, excludes: { count: 1, withEnd: 1 }, keepForever: { count: 1 }, endingSoon: { count: 1 } }
    render(<KeptTab data={data({ tiles: one })} />)
    const tiles = screen.getByTestId(`${BASE}-tiles`)
    expect(tiles).toHaveTextContent("1 member keeps titles. A Keep lasts 1 day.")
    expect(tiles).toHaveTextContent("1 has an end date")
    expect(tiles).toHaveTextContent("1Keep")
  })

  it("lists each protection with who made it, its end, its start and its note", () => {
    render(<KeptTab data={data()} />)
    expect(screen.getByRole("heading", { level: 2, name: "Kept and excluded titles" })).toHaveAttribute("tabindex", "-1")
    expect(screen.getByTestId(`${BASE}-filters-count`)).toHaveTextContent("31 titles")
    const keep = screen.getByTestId(`${BASE}-row-keep-1`)
    expect(keep).toHaveTextContent("Invented Show")
    expect(keep).toHaveTextContent("Whole show")
    expect(keep).toHaveTextContent("Kept")
    expect(keep).toHaveTextContent("by Sam Rivera")
    expect(keep).toHaveTextContent("Feb 6, 2027")
    expect(keep).toHaveTextContent("Nov 8, 2026")
    expect(screen.getByTestId(`${BASE}-row-keep-2`)).toHaveTextContent("Season 9")
    const exclusion = screen.getByTestId(`${BASE}-row-exclusion-1`)
    expect(exclusion).toHaveTextContent("Excluded")
    expect(exclusion).toHaveTextContent("by you")
    expect(exclusion).toHaveTextContent("No end date")
    expect(exclusion).toHaveTextContent("Rewatch in spring")
    expect(screen.getByTestId(`${BASE}-row-exclusion-2`)).toHaveTextContent("Jun 1, 2027")
    expect(screen.getByTestId(`${BASE}-row-exclusion-2`)).toHaveTextContent("by Alex Chen")
  })

  it("filters by Kind through the URL", async () => {
    const user = userEvent.setup()
    render(<KeptTab data={data()} />)
    await user.click(screen.getByTestId(`${BASE}-filters-filter-kind`))
    await user.click(await screen.findByTestId(`${BASE}-filters-filter-kind-option-exclude`))
    await waitFor(() => expect(currentHref()).toContain("kind=exclude"))
  })

  it("shows the first-use empty state with no protection at all", () => {
    const none = { keeps: { count: 0, members: 0, keepDays: 90 }, excludes: { count: 0, withEnd: 0 }, keepForever: { count: 0 }, endingSoon: { count: 0 } }
    render(<KeptTab data={data({ tiles: none, rows: [], total: 0 })} />)
    expect(screen.getByTestId(`${BASE}-empty`)).toHaveTextContent("No kept or excluded titles")
    expect(screen.getByTestId(`${BASE}-empty`)).toHaveTextContent("Members keep titles from the Leaving soon page.")
  })

  it("clears the filters from the filtered empty state", async () => {
    const user = userEvent.setup()
    resetUrl("/admin/cleanup?tab=kept&q=nothing&kind=keep")
    render(<KeptTab data={data({ rows: [], total: 0 })} />)
    expect(screen.getByTestId(`${BASE}-empty`)).toHaveTextContent("No titles match these filters")
    await user.click(screen.getByTestId(`${BASE}-clear-filters`))
    await waitFor(() => expect(currentHref()).toBe("/admin/cleanup?tab=kept"))
  })

  it("gives a Keep End keep and an exclusion Change end date and Remove exclusion", async () => {
    const user = userEvent.setup()
    render(<KeptTab data={data()} />)
    await user.click(screen.getByTestId(`${BASE}-actions-keep-1`))
    expect(await screen.findByTestId(`${BASE}-actions-keep-1-end-keep`)).toHaveTextContent("End keep...")
    expect(screen.queryByTestId(`${BASE}-actions-keep-1-remove-exclusion`)).not.toBeInTheDocument()
    await user.keyboard("{Escape}")
    await user.click(screen.getByTestId(`${BASE}-actions-exclusion-1`))
    expect(await screen.findByTestId(`${BASE}-actions-exclusion-1-change-end-date`)).toHaveTextContent("Change end date...")
    expect(screen.getByTestId(`${BASE}-actions-exclusion-1-remove-exclusion`)).toHaveTextContent("Remove exclusion...")
  })

  it("ends a member's Keep after the dialog, and keeps an error in the dialog", async () => {
    const user = userEvent.setup()
    render(<KeptTab data={data()} />)
    await openAction(user, "keep-1", "end-keep")
    const dialog = await screen.findByTestId("admin-cleanup-end-keep-dialog")
    expect(within(dialog).getByText("End Sam Rivera's Keep on Invented Show?")).toBeInTheDocument()
    expect(dialog).toHaveTextContent("Sam Rivera sees that you ended it, on the Leaving soon page and on Account.")
    jest.mocked(removeCleanupKeep).mockResolvedValueOnce({ success: false, code: "NOT_FOUND", error: "This Keep has already ended." })
    await user.click(screen.getByTestId("admin-cleanup-end-keep-confirm"))
    expect(await within(dialog).findByText("This Keep has already ended.")).toBeInTheDocument()
    await user.click(screen.getByTestId("admin-cleanup-end-keep-confirm"))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-end-keep-dialog")).not.toBeInTheDocument())
    expect(removeCleanupKeep).toHaveBeenCalledWith({ keepId: "keep-1" })
    expect(mockShowSuccess).toHaveBeenCalledWith("Keep ended")
  })

  it("words the End keep of the admin's own Keep, and of a member with no name", async () => {
    const user = userEvent.setup()
    const own = row("keep-3", { by: { id: "admin-1", name: "Admin", isYou: true } })
    const nameless = row("keep-4", { by: null })
    render(<KeptTab data={data({ rows: [own, nameless] })} />)
    await openAction(user, "keep-3", "end-keep")
    expect(await screen.findByTestId("admin-cleanup-end-keep-dialog")).toHaveTextContent("End your Keep on Invented keep-3?")
    await user.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-end-keep-dialog")).not.toBeInTheDocument())
    expect(screen.getByTestId(`${BASE}-row-keep-4`)).not.toHaveTextContent("by ")
    await openAction(user, "keep-4", "end-keep")
    expect(await screen.findByTestId("admin-cleanup-end-keep-dialog")).toHaveTextContent("End this member's Keep on Invented keep-4?")
  })

  it("removes an exclusion after the dialog", async () => {
    const user = userEvent.setup()
    render(<KeptTab data={data()} />)
    await openAction(user, "exclusion-1", "remove-exclusion")
    const dialog = await screen.findByTestId("admin-cleanup-remove-exclusion-dialog")
    expect(dialog).toHaveTextContent("Remove the exclusion on Invented exclusion-1?")
    expect(dialog).toHaveTextContent("Rules can match it again at the next run. If it joins Leaving soon, it gets a full grace period.")
    jest.mocked(removeCleanupExclusion).mockResolvedValueOnce({ success: false, code: "NOT_FOUND", error: "This exclusion has already ended." })
    await user.click(screen.getByTestId("admin-cleanup-remove-exclusion-confirm"))
    expect(await within(dialog).findByText("This exclusion has already ended.")).toBeInTheDocument()
    await user.click(screen.getByTestId("admin-cleanup-remove-exclusion-confirm"))
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("Exclusion removed"))
    expect(removeCleanupExclusion).toHaveBeenCalledWith({ exclusionId: "exclusion-1" })
  })

  it("opens Change end date on the current end and saves a new day", async () => {
    const user = userEvent.setup()
    render(<KeptTab data={data()} />)
    await openAction(user, "exclusion-2", "change-end-date")
    const dialog = await screen.findByTestId("admin-cleanup-end-date-dialog")
    expect(dialog).toHaveTextContent("Change the end date for Invented exclusion-2?")
    const date = screen.getByTestId("admin-cleanup-end-date-date")
    expect(date).toHaveValue("2027-06-01")
    expect(date).toHaveAttribute("min", "2026-11-08")
    await user.clear(date)
    await user.type(date, "2027-07-04")
    await user.click(screen.getByTestId("admin-cleanup-end-date-save"))
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalledWith("End date changed"))
    expect(setCleanupExclusionEnd).toHaveBeenCalledWith({ exclusionId: "exclusion-2", until: "2027-07-04" })
  })

  it("removes the end date, and checks a chosen day before it sends it", async () => {
    const user = userEvent.setup()
    render(<KeptTab data={data()} />)
    await openAction(user, "exclusion-1", "change-end-date")
    const dialog = await screen.findByTestId("admin-cleanup-end-date-dialog")
    expect(screen.queryByTestId("admin-cleanup-end-date-date")).not.toBeInTheDocument()
    await user.click(within(screen.getByTestId("admin-cleanup-end-date-until")).getByText("A date"))
    await user.click(screen.getByTestId("admin-cleanup-end-date-save"))
    expect(await within(dialog).findByText("Choose an end date.")).toBeInTheDocument()
    await user.type(screen.getByTestId("admin-cleanup-end-date-date"), "2026-11-01")
    await user.click(screen.getByTestId("admin-cleanup-end-date-save"))
    expect(await within(dialog).findByText("Choose today or a later date.")).toBeInTheDocument()
    expect(setCleanupExclusionEnd).not.toHaveBeenCalled()
    jest.mocked(setCleanupExclusionEnd).mockResolvedValueOnce({ success: false, code: "NOT_FOUND", error: "This exclusion has already ended." })
    await user.click(within(screen.getByTestId("admin-cleanup-end-date-until")).getByText("No end date"))
    await user.click(screen.getByTestId("admin-cleanup-end-date-save"))
    expect(await within(dialog).findByText("This exclusion has already ended.")).toBeInTheDocument()
    expect(setCleanupExclusionEnd).toHaveBeenCalledWith({ exclusionId: "exclusion-1", until: null })
  })
})
