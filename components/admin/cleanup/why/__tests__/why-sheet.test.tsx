/**
 * The Why Sheet shell (UX 4.5, 8.5, 7.9): the header with the poster, the
 * state badge, the meta line and the links, the summary of each state, To
 * include it with Try in the editor only, the seasonal hint, Other rules
 * and Data used, the side by width, the read-only History, loading and
 * errors, focus to the title and back to the opener, and the close after a
 * successful Postpone.
 */

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { postponeCleanupItems } from "@/actions/admin/cleanup-items"
import { metaLine, WhySheet, type WhySheetProps, whySummary } from "@/components/admin/cleanup/why/why-sheet"
import { Button } from "@/components/ui/button"
import { CleanupWhyFailed, useCleanupWhy } from "@/hooks/use-cleanup-why"
import { useMediaQuery } from "@/hooks/use-media-query"
import type { WhySheetData } from "@/lib/cleanup/types/preview"
import { bindFormat } from "@/lib/utils/format"

jest.mock("@/hooks/use-cleanup-why", () => {
  class CleanupWhyFailed extends Error {
    constructor(
      readonly code: string,
      message: string
    ) {
      super(message)
    }
  }
  return { CleanupWhyFailed, useCleanupWhy: jest.fn() }
})
jest.mock("@/hooks/use-media-query", () => ({ useMediaQuery: jest.fn() }))
jest.mock("@/actions/admin/cleanup-items", () => ({ excludeCleanupItems: jest.fn(), postponeCleanupItems: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const GB = 1024 ** 3
const f = bindFormat({ timeZone: "UTC", locale: "en-US" })

const MATCH: WhySheetData = {
  item: { itemKey: "movie:tmdb:1", level: "movie", title: "Invented Movie", year: 2023, seasonNumber: null, episodeCount: null, seasonCount: null,
    posterKey: "5001", sectionId: "1", sizeBytes: String(17 * GB) },
  state: "match",
  addedAt: "2024-03-03T12:00:00.000Z",
  links: { plexUrl: "https://app.plex.tv/desktop/#!/server/abc/details?key=%2Flibrary%2Fmetadata%2F5001", arrUrl: "https://radarr.example.com/movie/invented-movie-2023" },
  conditions: [
    { id: "c1", label: "Added", verdict: "pass", value: [{ text: "Added Mar 3, 2024." }], threshold: "more than 365 days", sources: [] },
    { id: "c2", label: "Last played", verdict: "pass", value: [{ text: "Never played." }], threshold: "more than 365 days ago, or never", sources: [] },
  ],
  hints: [],
  protections: [{ id: "g1", label: "Kept by a member", verdict: "clear", value: [{ text: "No Keep." }] }],
  then: { text: [{ text: "If the rule is turned on, Radarr deletes the movie and its 17 GB file." }], dryRun: true },
  otherRules: [],
  sources: [
    { service: "plex", state: "ok", readAt: "2026-11-08T03:07:00.000Z" },
    { service: "tautulli", state: "failed", readAt: null },
    { service: "overseerr", state: "notConfigured", readAt: null },
  ],
}

const NEAR_MISS: WhySheetData = {
  ...MATCH,
  state: "nearMiss",
  conditions: [MATCH.conditions[0], { ...MATCH.conditions[1], verdict: "fail", value: [{ text: "Last played Dec 21, 2025." }] }, { ...MATCH.conditions[0], id: "c3" }],
  forecast: { passesOn: "2026-12-21", text: "If nobody plays it, it passes on Dec 21, 2026." },
  tryValue: { conditionId: "c2", value: { duration: { amount: 10, unit: "months" } }, label: "more than 10 months", addsCount: 22, addsBytes: String(131 * GB) },
  hints: [{ kind: "seasonalCollection", collection: "Winter Lights" }],
  then: undefined,
}

const onClose = jest.fn()
const onTry = jest.fn()
const onActionDone = jest.fn()

function Harness(props: Partial<WhySheetProps>) {
  const [key, setKey] = useState<string | null>(null)
  return (
    <>
      <Button onClick={() => setKey("movie:tmdb:1")} data-testid="open-why">
        Why
      </Button>
      <WhySheet
        itemKey={key}
        onClose={() => {
          onClose()
          setKey(null)
        }}
        scope="rule-1"
        ruleId="rule-1"
        surface="preview"
        {...props}
      />
    </>
  )
}

function answer(data: WhySheetData | undefined, extra: { isError?: boolean; error?: Error | null } = {}) {
  jest.mocked(useCleanupWhy).mockReturnValue({ data, isError: extra.isError ?? false, error: extra.error ?? null } as never)
}

async function openSheet(user: ReturnType<typeof userEvent.setup>, props: Partial<WhySheetProps> = {}) {
  render(<Harness {...props} />)
  await user.click(screen.getByTestId("open-why"))
  return screen.findByTestId("admin-cleanup-why")
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useMediaQuery).mockReturnValue(true)
  answer(MATCH)
})

describe("WhySheet", () => {
  it("shows the header, the summary and the wave 3 parts of a match, on the right from md, with focus on the title", async () => {
    const user = userEvent.setup()
    const sheet = await openSheet(user)
    expect(sheet).toHaveAttribute("data-side", "right")
    const title = screen.getByRole("heading", { level: 2, name: "Invented Movie (2023)" })
    await waitFor(() => expect(title).toHaveFocus())
    expect(screen.getByTestId("admin-cleanup-why-state")).toHaveTextContent("Match")
    expect(sheet).toHaveTextContent("Movies. 17 GB on disk, up to 17 GB freed. Added Mar 3, 2024.")
    expect(screen.getByTestId("admin-cleanup-why-open-plex")).toHaveAttribute("href", MATCH.links.plexUrl)
    expect(screen.getByTestId("admin-cleanup-why-open-arr")).toHaveTextContent("Open in Radarr")
    expect(screen.getByTestId("admin-cleanup-why-open-arr")).toHaveAttribute("target", "_blank")
    expect(screen.getByTestId("admin-cleanup-why-summary")).toHaveTextContent(
      "All 2 conditions pass, and no protection applies. This rule is in Dry run, so a run only records it.")
    expect(screen.getByTestId("admin-cleanup-why-conditions")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-why-protections")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-why-then")).toHaveTextContent("If the rule is turned on, Radarr deletes the movie")
    expect(screen.getByTestId("admin-cleanup-why-other-rules")).toHaveTextContent("No other rule matches it.")
    const data = within(screen.getByTestId("admin-cleanup-why-data"))
    expect(data.getByText(/^Plex, read at .*3:07 AM/)).toBeInTheDocument()
    expect(data.getByText("Tautulli did not answer")).toBeInTheDocument()
    expect(data.queryByText(/Overseerr/)).not.toBeInTheDocument()
    expect(useCleanupWhy).toHaveBeenLastCalledWith(expect.objectContaining({ itemKey: "movie:tmdb:1", scope: "rule-1", ruleId: "rule-1", enabled: true }))
  })

  it("is a bottom Sheet below md, with its grabber", async () => {
    const user = userEvent.setup()
    jest.mocked(useMediaQuery).mockReturnValue(false)
    const sheet = await openSheet(user)
    expect(sheet).toHaveAttribute("data-side", "bottom")
    expect(sheet.querySelector("[data-slot=sheet-grabber]")).not.toBeNull()
  })

  it("gives focus back to the opener on Close", async () => {
    const user = userEvent.setup()
    await openSheet(user)
    await user.click(screen.getByTestId("admin-cleanup-why-close"))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-why")).not.toBeInTheDocument())
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByTestId("open-why")).toHaveFocus())
  })

  it("gives focus to the finalFocus of the owner when it names one (architecture-r8-2)", async () => {
    const user = userEvent.setup()
    const heading = document.createElement("h2")
    heading.tabIndex = -1
    document.body.append(heading)
    await openSheet(user, { finalFocus: () => heading })
    await user.click(screen.getByTestId("admin-cleanup-why-close"))
    await waitFor(() => expect(heading).toHaveFocus())
    heading.remove()
  })

  it("shows To include it, Try and the seasonal hint for a near miss in the editor; Try changes the draft and closes", async () => {
    const user = userEvent.setup()
    answer(NEAR_MISS)
    await openSheet(user, { onTry, definition: undefined })
    expect(screen.getByTestId("admin-cleanup-why-state")).toHaveTextContent("Near miss")
    expect(screen.getByTestId("admin-cleanup-why-summary")).toHaveTextContent("It fails 1 of 3 conditions, so it is not a match. Nothing changes for it.")
    expect(screen.getByTestId("admin-cleanup-why")).toHaveTextContent("Movies. 17 GB on disk.")
    expect(screen.getByTestId("admin-cleanup-why-include")).toHaveTextContent(
      "If nobody plays it, it passes on Dec 21, 2026. Or change Last played to more than 10 months: that adds 22 movies, 131 GB.")
    expect(screen.getByTestId("admin-cleanup-why-hint")).toHaveTextContent("This movie is in the Plex collection Winter Lights, which Kometa makes.")
    await user.click(screen.getByTestId("admin-cleanup-why-try"))
    expect(onTry).toHaveBeenCalledWith(NEAR_MISS.tryValue)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("shows no Try outside the editor", async () => {
    const user = userEvent.setup()
    answer(NEAR_MISS)
    await openSheet(user)
    expect(screen.getByTestId("admin-cleanup-why-include")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-why-try")).not.toBeInTheDocument()
  })

  it("is read only from History: the stored run, a Deleted badge and only Close", async () => {
    const user = userEvent.setup()
    answer({ ...MATCH, state: "deleted", then: undefined, fromRun: { runId: "run-1", at: "2026-11-03T03:07:00.000Z" } })
    await openSheet(user, { surface: "history", outcomeId: "outcome-1" })
    expect(screen.getByTestId("admin-cleanup-why-state")).toHaveTextContent("DeletedNov 3, 2026")
    expect(screen.getByTestId("admin-cleanup-why-summary")).toHaveTextContent("Radarr deleted it on Nov 3, 2026. These are the facts that the run saw.")
    expect(screen.getByTestId("admin-cleanup-why-data")).toHaveTextContent("From the run on Nov 3, 2026, 3:07 AM.")
    expect(screen.queryByTestId("admin-cleanup-why-other-rules")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-why-exclude")).not.toBeInTheDocument()
    expect(useCleanupWhy).toHaveBeenLastCalledWith(expect.objectContaining({ outcomeId: "outcome-1" }))
  })

  it("closes after a successful Postpone of a Leaving soon title, after it told the owner", async () => {
    const user = userEvent.setup()
    jest.mocked(postponeCleanupItems).mockResolvedValue({ success: true, data: { postponed: 1, skipped: 0, firstLeaveOn: "2026-11-27", lastLeaveOn: "2026-11-27" } })
    answer({ ...MATCH, state: "leaving", leaving: { enteredAt: "2026-10-17T03:07:00.000Z", leaveOn: "2026-11-16", status: "leaving" },
      otherRules: [{ ruleId: "rule-2", name: "Never watched movies", mode: "reviewFirst", enteredAt: "2026-10-17T03:07:00.000Z", leaveOn: "2026-11-16" }] })
    await openSheet(user, { surface: "leaving", onActionDone })
    expect(screen.getByTestId("admin-cleanup-why-state")).toHaveTextContent("Leaving soon")
    expect(screen.getByTestId("admin-cleanup-why-summary")).toHaveTextContent("It joined Leaving soon on Oct 17, 2026. It leaves on Nov 16, 2026, unless something takes it out.")
    expect(screen.getByTestId("admin-cleanup-why-other-rules")).toHaveTextContent("Also matches Never watched movies. In Leaving soon since Oct 17. Leaves Nov 16.")
    await user.click(screen.getByTestId("admin-cleanup-why-postpone"))
    await user.click(await screen.findByTestId("admin-cleanup-postpone-confirm"))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-why")).not.toBeInTheDocument())
    expect(onActionDone).toHaveBeenCalledWith(expect.objectContaining({ postponed: 1 }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("keeps focus on the title when the data arrives after the Sheet opened (UX review UX-04)", async () => {
    answer(undefined)
    const { rerender } = render(<WhySheet itemKey="movie:tmdb:1" onClose={onClose} scope="rule-1" ruleId="rule-1" surface="preview" title="Invented Movie" />)
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Invented Movie" })).toHaveFocus())
    answer(MATCH)
    rerender(<WhySheet itemKey="movie:tmdb:1" onClose={onClose} scope="rule-1" ruleId="rule-1" surface="preview" title="Invented Movie" />)
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Invented Movie (2023)" })).toHaveFocus())
  })

  it("shows the given title while it loads, and the action's words when it fails", async () => {
    const user = userEvent.setup()
    answer(undefined)
    await openSheet(user, { title: "Invented Movie" })
    expect(screen.getByRole("heading", { level: 2, name: "Invented Movie" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-why-loading")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-why-exclude")).not.toBeInTheDocument()
  })

  it.each([
    ["the action's words", new CleanupWhyFailed("NOT_FOUND", "This title is not in the library data."), "This title is not in the library data."],
    ["the fallback for any other error", new Error("socket hang up"), "That didn't work. Try again."],
  ])("shows %s when it fails", async (_label, error, words) => {
    const user = userEvent.setup()
    answer(undefined, { isError: true, error })
    await openSheet(user)
    expect(screen.getByRole("heading", { level: 2, name: "Why" })).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent(words)
  })
})

describe("whySummary", () => {
  const show = { ...MATCH.item, itemKey: "show:tvdb:9", level: "show" as const }

  it.each([
    ["a match of a live rule", { then: { text: [], dryRun: false } }, "All 2 conditions pass, and no protection applies. The next run puts it in Leaving soon."],
    ["a match of one condition", { conditions: [MATCH.conditions[0]], then: undefined }, "The condition passes, and no protection applies. The next run puts it in Leaving soon."],
    ["a protected title", { state: "protected" as const, protections: [{ id: "g4", label: "Played by anyone in the last 30 days", verdict: "protects" as const, value: [] }] },
      "All 2 conditions pass, but a protection keeps it safe: Played by anyone in the last 30 days."],
    ["a protected title of one condition", { state: "protected" as const, conditions: [MATCH.conditions[0]], protections: [] },
      "The condition passes, but a protection keeps it safe."],
    ["missing data", { state: "missing" as const, conditions: [{ ...MATCH.conditions[1], verdict: "unknown" as const }] },
      "Last played is unknown, so it is not a match. It keeps its current state."],
    ["a missing protection value", { state: "missing" as const, protections: [{ id: "g8", label: "On a watchlist", verdict: "unknown" as const, value: [] }] },
      "On a watchlist is unknown, so it is not a match. It keeps its current state."],
    ["missing data with no named value", { state: "missing" as const, protections: [] }, "A value is unknown, so it is not a match. It keeps its current state."],
    ["a show that cannot be deleted, with no cause", { state: "cannotDelete" as const, item: show }, "Sonarr cannot delete it. Cleanup never deletes it."],
    ["a title that cannot be deleted, with its cause", { state: "cannotDelete" as const, cause: "Two Radarr records match." },
      "Two Radarr records match. Cleanup never deletes it."],
    ["a Leaving soon title with no dates", { state: "leaving" as const, leaving: undefined }, "It is in Leaving soon."],
    ["a deletion with no run", { state: "deleted" as const }, "Radarr deleted it. These are the facts that the run saw."],
    ["an item that no list shows", { state: "notListed" as const }, ""],
  ])("words %s", (_label, change, words) => {
    expect(whySummary({ ...MATCH, ...change }, f)).toBe(words)
  })

  it.each([
    ["a size and an added date", {}, "Movies. 17 GB on disk, up to 17 GB freed. Added Mar 3, 2024."],
    ["no added date", { addedAt: null }, "Movies. 17 GB on disk, up to 17 GB freed."],
    ["an unknown size", { item: { ...MATCH.item, sizeBytes: null } }, "Movies. Size unknown. Added Mar 3, 2024."],
  ])("writes the meta line with %s", (_label, change, words) => {
    expect(metaLine({ ...MATCH, ...change }, f)).toBe(words)
  })
})
