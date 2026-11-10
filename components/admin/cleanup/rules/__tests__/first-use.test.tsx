/**
 * The first-use state of the Rules tab (UX 4.1.1, TS 7.10): before any
 * library read, a client effect asks for the first read once per mount, never
 * with library data or without the job queue, and the page reads its data
 * again while the read runs. "Use this recipe" opens the New rule Sheet at
 * that recipe's step.
 */

import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { startCleanupFirstRead } from "@/actions/admin/cleanup-settings"
import { FIRST_READ_REFRESH_MS, FirstUse, hasNoLibraryData } from "@/components/admin/cleanup/rules/first-use"
import { RECIPE_IDS, type RecipeId } from "@/lib/cleanup/constants"
import { getRecipe } from "@/lib/cleanup/recipes"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"

const mockRefresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: mockRefresh }) }))
jest.mock("@/actions/admin/cleanup-settings", () => ({ startCleanupFirstRead: jest.fn(), refreshCleanupData: jest.fn() }))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
jest.mock("@/components/admin/cleanup/new-rule/new-rule-sheet", () => ({
  NewRuleSheet: ({ open, recipeId, graceDays }: { open: boolean; recipeId: RecipeId | null; graceDays: number }) =>
    open ? <div data-testid="admin-cleanup-recipe-sheet">{`${recipeId} ${graceDays}`}</div> : null,
}))

const NOW = Date.parse("2026-11-08T12:00:00.000Z")
const NO_DATA = { id: null, takenAt: null, finishedAt: null, reading: false }

const recipes: RecipeCardData[] = RECIPE_IDS.map((id) => ({
  id, name: getRecipe(id).name, level: "movie", sentence: [], keyValues: [], note: null, today: null, needs: [], posters: [],
}))

function data(overrides: Partial<CleanupOverviewData> = {}): CleanupOverviewData {
  return {
    feature: { enabled: false, enabledAt: null, pausedAt: null, pausedBy: null, redis: true },
    sources: [],
    snapshot: NO_DATA,
    blocks: [],
    library: { movies: { count: 0, bytes: "0" }, shows: { count: 0, bytes: "0", seasons: 0 }, freeBytes: null, totalBytes: null, growthBytesPerMonth: null },
    stats: { leaving: { count: 0, bytes: "0", nextLeaveAt: null }, waiting: null, freed30d: { count: 0, bytes: "0", level: null } },
    batches: [],
    rules: [],
    recipes,
    defaults: { graceDays: 45 },
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(startCleanupFirstRead).mockResolvedValue({ success: true, data: { queued: true } })
})

afterEach(() => jest.useRealTimers())

describe("FirstUse first read", () => {
  it("asks for the first read once per mount, and says that it reads the library", () => {
    const { rerender } = render(<FirstUse data={data()} now={NOW} />)
    rerender(<FirstUse data={data({ snapshot: { ...NO_DATA, reading: true } })} now={NOW} />)

    expect(startCleanupFirstRead).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("admin-cleanup-first-read")).toHaveTextContent("Reading your library for the first time. This takes 1 to 3 minutes.")
  })

  it("asks again after a new mount, and never with library data", () => {
    const { unmount } = render(<FirstUse data={data()} now={NOW} />)
    unmount()
    render(<FirstUse data={data()} now={NOW} />)
    expect(startCleanupFirstRead).toHaveBeenCalledTimes(2)
  })

  it.each([
    ["library data", data({ snapshot: { id: "snap-1", takenAt: "2026-11-08T03:07:00.000Z", finishedAt: "2026-11-08T03:09:00.000Z", reading: false } })],
    ["no job queue", data({ feature: { enabled: false, enabledAt: null, pausedAt: null, pausedBy: null, redis: false } })],
  ])("asks for nothing with %s", (_case, value) => {
    jest.useFakeTimers()
    render(<FirstUse data={value} now={NOW} />)
    act(() => jest.advanceTimersByTime(FIRST_READ_REFRESH_MS * 2))

    expect(startCleanupFirstRead).not.toHaveBeenCalled()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("reads the page again while the first read runs, and stops after unmount or when the data comes", () => {
    jest.useFakeTimers()
    const { rerender, unmount } = render(<FirstUse data={data()} now={NOW} />)

    act(() => jest.advanceTimersByTime(FIRST_READ_REFRESH_MS))
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    rerender(<FirstUse data={data({ snapshot: { id: "snap-1", takenAt: "2026-11-08T12:01:00.000Z", finishedAt: "2026-11-08T12:02:00.000Z", reading: false } })} now={NOW} />)
    act(() => jest.advanceTimersByTime(FIRST_READ_REFRESH_MS * 3))
    expect(mockRefresh).toHaveBeenCalledTimes(1)
    unmount()
  })

  it("survives a refused request: the refresh shows the read that already runs", async () => {
    jest.mocked(startCleanupFirstRead).mockRejectedValue(new Error("network"))
    render(<FirstUse data={data()} now={NOW} />)
    await act(async () => undefined)

    expect(screen.getByTestId("admin-cleanup-recipes")).toBeInTheDocument()
  })

  it("knows when library data exists", () => {
    expect(hasNoLibraryData(NO_DATA)).toBe(true)
    expect(hasNoLibraryData({ ...NO_DATA, finishedAt: "2026-11-08T03:09:00.000Z" })).toBe(false)
  })
})

describe("FirstUse gallery", () => {
  it("shows the off alert while off, a skeleton count on every recipe before the first read, and the blank card", () => {
    render(<FirstUse data={data()} now={NOW} />)

    expect(screen.getByTestId("admin-cleanup-alert-off")).toBeInTheDocument()
    for (const id of RECIPE_IDS) expect(screen.getByTestId(`admin-cleanup-recipe-${id}-count`)).toHaveAttribute("data-slot", "skeleton")
    expect(screen.getByTestId("admin-cleanup-recipe-blank-start")).toHaveTextContent("Start from a blank rule")
  })

  it("opens the New rule Sheet at the recipe step of the card, with the Settings grace period", async () => {
    const user = userEvent.setup()
    render(<FirstUse data={data()} now={NOW} />)

    expect(screen.queryByTestId("admin-cleanup-recipe-sheet")).not.toBeInTheDocument()
    await user.click(screen.getByTestId("admin-cleanup-recipe-big-shows-nobody-plays-use"))
    expect(screen.getByTestId("admin-cleanup-recipe-sheet")).toHaveTextContent("big-shows-nobody-plays 45")
  })
})
