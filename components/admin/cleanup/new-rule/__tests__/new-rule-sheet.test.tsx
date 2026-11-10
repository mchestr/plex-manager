/**
 * The New rule Sheet (UX 4.2): the picker list with today's counts, the
 * blank start, a recipe that needs a missing service, and the recipe step:
 * chips with counts, "Other" with its inline number, the level choice of a
 * two-level recipe with a count in each segment, the live result, "Change
 * all conditions" and "Create rule (dry run)".
 */

import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Activity } from "react"

import { previewCleanupRecipe } from "@/actions/admin/cleanup-preview"
import { createCleanupRuleFromRecipe } from "@/actions/admin/cleanup-rules"
import { createQueryWrapper } from "@/__tests__/helpers/query-client"
import { NewRuleSheet, type NewRuleSheetProps } from "@/components/admin/cleanup/new-rule/new-rule-sheet"
import { RECIPE_IDS, type RecipeId } from "@/lib/cleanup/constants"
import { getRecipe, recipeValueLabel, recipeValueParam } from "@/lib/cleanup/recipes"
import type { RecipePreview } from "@/lib/cleanup/types/preview"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

jest.mock("@/actions/admin/cleanup-preview", () => ({ previewCleanupRecipe: jest.fn() }))
jest.mock("@/actions/admin/cleanup-rules", () => ({ createCleanupRuleFromRecipe: jest.fn() }))

const mockPush = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, refresh: jest.fn() }) }))

const mockShowSuccess = jest.fn()
const mockShowError = jest.fn()
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }) }))

const NOW = Date.parse("2026-11-08T12:00:00.000Z")

function card(id: RecipeId, overrides: Partial<RecipeCardData> = {}): RecipeCardData {
  const recipe = getRecipe(id)
  return {
    id, name: recipe.name, level: recipe.levels.length > 1 ? "movieOrShow" : recipe.levels[0], sentence: [], keyValues: [], note: null,
    today: { count: 152, bytes: "900", ...(recipe.levels.length > 1 ? { altCount: 21 } : {}) }, needs: [], posters: [], ...overrides,
  }
}

const CARDS = RECIPE_IDS.map((id) => card(id))

/** A preview whose matches follow the values: the count is the number of days of "added", or 7 for a show. */
function preview(input: Parameters<typeof previewCleanupRecipe>[0]): RecipePreview {
  const recipe = getRecipe(input.recipeId)
  const level = input.level ?? recipe.levels[0]
  const added = String(input.values.added ?? "180d")
  const matches = level === "show" ? 7 : Number.parseInt(added, 10)
  const item = (n: number) => ({ itemKey: `movie:tmdb:${n}`, level, title: `Film ${n}`, year: 2020, seasonNumber: null, episodeCount: null,
    seasonCount: null, posterKey: `${n}`, sectionId: "1", sizeBytes: String(n * GiB), why: [] })
  return {
    recipeId: input.recipeId, level, checked: 777, matches, bytes: String(966367641600),
    chips: Object.fromEntries(recipe.keys.filter((k) => k.field !== "grace").map((k) => [k.key, k.chips.map((chip, i) => ({
      value: chip, label: recipeValueLabel(k, chip), matches: 100 + i,
    }))])),
    largest: [item(22), item(17), item(12), item(8)], protectedCount: 14, globalProtections: 10, zero: null,
    sentence: [{ text: "Movies in the " }, { text: "Movies", strong: true }, { text: " library." }],
    historyStart: "2022-06-14T00:00:00.000Z", takenAt: new Date(NOW - 3600_000).toISOString(), needs: [],
  }
}

function renderSheet(props: Partial<NewRuleSheetProps> = {}) {
  const onOpenChange = jest.fn()
  const view = render(<NewRuleSheet open onOpenChange={onOpenChange} recipes={CARDS} now={NOW} {...props} />, { wrapper: createQueryWrapper() })
  return { ...view, onOpenChange }
}

const lastValues = () => jest.mocked(previewCleanupRecipe).mock.calls.at(-1)?.[0]

/** jsdom cannot follow a link: the test checks the href and the click handler instead. */
const stayOnPage = (event: MouseEvent) => {
  if (event.target instanceof Element && event.target.closest("a")) event.preventDefault()
}

beforeAll(() => window.addEventListener("click", stayOnPage))
afterAll(() => window.removeEventListener("click", stayOnPage))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(previewCleanupRecipe).mockImplementation(async (input) => ({ success: true, data: preview(input) }))
  jest.mocked(createCleanupRuleFromRecipe).mockResolvedValue({ success: true, data: { ruleId: "rule-new", dryRunQueued: true } })
})

describe("NewRuleSheet picker", () => {
  it("lists the ten recipes with their level and today's count, then the blank start, in a bottom Sheet below md", () => {
    renderSheet()
    const sheet = screen.getByTestId("admin-cleanup-new-rule-sheet")
    expect(sheet).toHaveAttribute("data-side", "bottom")
    expect(within(sheet).getByRole("heading", { name: "New rule" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-new-rule-recipe-never-watched-movies")).toHaveTextContent("Never watched moviesMovies. Today: 152 movies")
    expect(screen.getByTestId("admin-cleanup-new-rule-recipe-requested-never-watched")).toHaveTextContent("Movies or whole shows. Today: 152 movies or 21 shows")
    expect(screen.getByTestId("admin-cleanup-new-rule-recipe-old-seasons")).toHaveTextContent("Seasons. Today: 152 seasons")
    expect(screen.getByTestId("admin-cleanup-new-rule-blank")).toHaveAttribute("href", "/admin/cleanup/rules/new")
    expect(within(sheet).getAllByRole("listitem")).toHaveLength(11)
  })

  it("is a right Sheet from md", () => {
    const matchMedia = window.matchMedia
    window.matchMedia = (query: string) => ({ ...matchMedia(query), matches: true })
    renderSheet()
    expect(screen.getByTestId("admin-cleanup-new-rule-sheet")).toHaveAttribute("data-side", "right")
    window.matchMedia = matchMedia
  })

  it("names a missing service and keeps that recipe closed, and shows no count without library data", () => {
    renderSheet({ recipes: [card("finished-shows", { needs: ["sonarr"] }), card("big-movies", { today: null })] })
    const blocked = screen.getByTestId("admin-cleanup-new-rule-recipe-finished-shows")
    expect(blocked).toHaveTextContent("Whole shows. Needs Sonarr")
    expect(blocked).toBeDisabled()
    expect(screen.getByTestId("admin-cleanup-new-rule-recipe-big-movies")).toHaveTextContent(/^Big movies, little watchingMovies$/)
  })

  it("opens a recipe's step, goes back to the list, and closes on the blank start", async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderSheet()
    await user.click(screen.getByTestId("admin-cleanup-new-rule-recipe-never-watched-movies"))
    expect(screen.getByTestId("admin-cleanup-recipe-sheet")).toHaveTextContent("Recipe for movies")
    expect(screen.getByRole("heading", { name: "Never watched movies" })).toBeInTheDocument()
    await user.click(screen.getByTestId("admin-cleanup-new-rule-back"))
    expect(screen.getByTestId("admin-cleanup-new-rule-sheet")).toBeInTheDocument()
    await user.click(screen.getByTestId("admin-cleanup-new-rule-blank"))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("opens at the recipe step of a gallery card, and at it again on the next open", () => {
    const { rerender } = renderSheet({ recipeId: "big-movies" })
    expect(screen.getByRole("heading", { name: "Big movies, little watching" })).toBeInTheDocument()
    rerender(<NewRuleSheet open={false} onOpenChange={jest.fn()} recipes={CARDS} recipeId="old-seasons" now={NOW} />)
    rerender(<NewRuleSheet open onOpenChange={jest.fn()} recipes={CARDS} recipeId="old-seasons" now={NOW} />)
    expect(screen.getByRole("heading", { name: "Old seasons nobody plays" })).toBeInTheDocument()
  })

  it("opens from its own trigger, and closes as the router hides the page", async () => {
    const user = userEvent.setup()
    const onOpenChange = jest.fn()
    const view = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <NewRuleSheet trigger={<button type="button">New rule</button>} onOpenChange={onOpenChange} recipes={CARDS} />
      </Activity>
    )
    const { rerender } = render(view("visible"), { wrapper: createQueryWrapper() })
    expect(screen.queryByTestId("admin-cleanup-new-rule-sheet")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "New rule" }))
    expect(await screen.findByTestId("admin-cleanup-new-rule-sheet")).toBeInTheDocument()
    expect(onOpenChange).toHaveBeenCalledWith(true)
    act(() => rerender(view("hidden")))
    act(() => rerender(view("visible")))
    await waitFor(() => expect(screen.queryByTestId("admin-cleanup-new-rule-sheet")).not.toBeInTheDocument())
  })
})

describe("NewRuleSheet recipe step", () => {
  it("shows the chips with their counts, the live result, the largest matches and the plain words", async () => {
    renderSheet({ recipeId: "never-watched-movies", graceDays: 30 })
    expect(await screen.findByTestId("admin-cleanup-recipe-count")).toHaveTextContent("180")
    expect(screen.getByText("movies of 777 checked")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-recipe-bytes")).toHaveTextContent("900 GB")
    const added = screen.getByTestId("admin-cleanup-recipe-value-added")
    expect(within(added).getAllByRole("radio").map((r) => r.getAttribute("aria-label") ?? r.textContent)).toEqual([
      "90 days, 100 matches", "180 days, 101 matches", "365 days, 102 matches", "2 years, 103 matches", "Other",
    ])
    expect(screen.getByTestId("admin-cleanup-recipe-value-added-option-180d")).toHaveAttribute("data-checked")
    expect(screen.getByText("Uses the newer of the Plex and Radarr dates.")).toBeInTheDocument()
    const grace = screen.getByTestId("admin-cleanup-recipe-value-grace")
    expect(within(grace).getAllByRole("radio").map((r) => r.textContent)).toEqual(["14 days", "30 days", "60 days", "90 days"])
    expect(screen.getByTestId("admin-cleanup-recipe-value-grace-option-30")).toHaveAttribute("data-checked")
    expect(screen.getByText("Never means no counted play since Tautulli history starts on Jun 14, 2022. Library data from 11:00 AM today.")).toBeInTheDocument()
    expect(screen.getByText("Film 22 22 GB, Film 17 17 GB, Film 12 12 GB and 177 more.")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-recipe-plain-words")).toHaveTextContent("In plain wordsMovies in the Movies library.")
    expect(screen.getByText("10 global protections keep 14 movies safe.")).toBeInTheDocument()
    expect(screen.getByText("When you create the rule, a dry run starts at once.")).toBeInTheDocument()
    expect(screen.getByText("The rule starts in Dry run")).toBeInTheDocument()
    expect(document.querySelector("[aria-live='polite']")).toHaveTextContent("180 movies of 777 checked. Up to 900 gigabytes.")
    expect(lastValues()).toEqual({ recipeId: "never-watched-movies", level: "movie", values: { added: "180d", grace: "30" } })
  })

  it("counts again at once after a chip press", async () => {
    const user = userEvent.setup()
    renderSheet({ recipeId: "never-watched-movies" })
    await screen.findByTestId("admin-cleanup-recipe-count")
    await user.click(screen.getByTestId("admin-cleanup-recipe-value-added-option-365d"))
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-recipe-count")).toHaveTextContent("365"))
    expect(lastValues()?.values).toEqual({ added: "365d" })
    await user.click(screen.getByTestId("admin-cleanup-recipe-value-grace-option-60"))
    await waitFor(() => expect(lastValues()?.values).toEqual({ added: "365d", grace: "60" }))
  })

  it("types another value under Other, in days, inside its range, and needs a value to create", async () => {
    const user = userEvent.setup()
    renderSheet({ recipeId: "never-watched-movies" })
    await screen.findByTestId("admin-cleanup-recipe-count")
    await user.click(screen.getByTestId("admin-cleanup-recipe-value-added-other"))
    const input = screen.getByTestId("admin-cleanup-recipe-value-added-input")
    expect(input).toHaveValue("180")
    expect(screen.getByRole("textbox", { name: "Other value, in days" })).toBe(input)
    await user.clear(input)
    expect(screen.getByTestId("admin-cleanup-recipe-create")).toBeDisabled()
    await user.type(input, "400")
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-recipe-count")).toHaveTextContent("400"), { timeout: 2000 })
    expect(lastValues()?.values).toEqual({ added: "400d" })
    expect(screen.getByTestId("admin-cleanup-recipe-create")).toBeEnabled()

    await user.clear(input)
    await user.type(input, "5000")
    // The field keeps the value inside 1 to 3650 days
    await waitFor(() => expect(lastValues()?.values).toEqual({ added: "3650d" }), { timeout: 2000 })
    await user.click(screen.getByTestId("admin-cleanup-recipe-value-added-option-90d"))
    expect(screen.queryByTestId("admin-cleanup-recipe-value-added-input")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-recipe-create")).toBeEnabled()
  })

  it("types a size in GB under Other", async () => {
    const user = userEvent.setup()
    renderSheet({ recipeId: "big-movies" })
    await screen.findByTestId("admin-cleanup-recipe-count")
    expect(screen.queryByTestId("admin-cleanup-recipe-value-plays-other")).not.toBeInTheDocument()
    await user.click(screen.getByTestId("admin-cleanup-recipe-value-size-other"))
    const input = screen.getByRole("textbox", { name: "Other value, in GB" })
    expect(input).toHaveValue("20")
    await user.clear(input)
    await user.type(input, "30")
    await waitFor(() => expect(lastValues()?.values).toMatchObject({ size: String(30 * GiB) }), { timeout: 2000 })
  })

  it("switches the level of a two-level recipe, with a count in each segment", async () => {
    const user = userEvent.setup()
    renderSheet({ recipeId: "requested-never-watched" })
    expect(screen.getByTestId("admin-cleanup-recipe-sheet")).toHaveTextContent("Recipe for movies or whole shows")
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-recipe-level-show")).toHaveTextContent("Whole shows7"))
    expect(screen.getByTestId("admin-cleanup-recipe-level-movie")).toHaveTextContent("Movies180")
    expect(screen.getByTestId("admin-cleanup-recipe-level-movie")).toHaveAttribute("data-checked")
    await user.click(screen.getByTestId("admin-cleanup-recipe-level-show"))
    await waitFor(() => expect(screen.getByTestId("admin-cleanup-recipe-count")).toHaveTextContent("7"))
    expect(screen.getByText("shows of 777 checked")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-recipe-change-all").getAttribute("href")).toContain("level=show")
    await user.click(screen.getByTestId("admin-cleanup-recipe-create"))
    await waitFor(() => expect(createCleanupRuleFromRecipe).toHaveBeenCalledWith({ recipeId: "requested-never-watched", level: "show",
      values: { requested: "120d", lastPlayed: "180d" } }))
    await user.click(screen.getByTestId("admin-cleanup-recipe-level-movie"))
    await user.click(screen.getByTestId("admin-cleanup-recipe-create"))
    await waitFor(() => expect(createCleanupRuleFromRecipe).toHaveBeenLastCalledWith(expect.objectContaining({ level: "movie" })))
  })

  it("creates the rule in Dry run, toasts, closes the Sheet and opens the rule", async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderSheet({ recipeId: "never-watched-movies" })
    await screen.findByTestId("admin-cleanup-recipe-count")
    await user.click(screen.getByTestId("admin-cleanup-recipe-create"))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/admin/cleanup/rules/rule-new"))
    expect(createCleanupRuleFromRecipe).toHaveBeenCalledWith({ recipeId: "never-watched-movies", values: { added: "180d" } })
    expect(mockShowSuccess).toHaveBeenCalledWith("Rule created")
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("keeps the Sheet open with an error toast when the create is refused", async () => {
    const user = userEvent.setup()
    jest.mocked(createCleanupRuleFromRecipe).mockResolvedValueOnce({ success: false, code: "VALIDATION", error: "You can have at most 50 rules." })
    const { onOpenChange } = renderSheet({ recipeId: "never-watched-movies" })
    await screen.findByTestId("admin-cleanup-recipe-count")
    await user.click(screen.getByTestId("admin-cleanup-recipe-create"))
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith("You can have at most 50 rules."))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("opens the editor with the values and nothing saved from Change all conditions", async () => {
    const user = userEvent.setup()
    const { onOpenChange } = renderSheet({ recipeId: "never-watched-movies" })
    await screen.findByTestId("admin-cleanup-recipe-count")
    const link = screen.getByTestId("admin-cleanup-recipe-change-all")
    expect(link).toHaveAttribute("href", "/admin/cleanup/rules/new?recipe=never-watched-movies&added=180d")
    await user.click(link)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(createCleanupRuleFromRecipe).not.toHaveBeenCalled()
  })

  it("names a missing service and keeps Create off, and shows a refused preview", async () => {
    jest.mocked(previewCleanupRecipe).mockImplementation(async (input) => ({ success: true, data: { ...preview(input), needs: ["overseerr", "tautulli"] } }))
    const { unmount } = renderSheet({ recipeId: "requested-never-watched" })
    expect(await screen.findByText("Needs Overseerr and Tautulli")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-recipe-create")).toBeDisabled()
    unmount()

    jest.mocked(previewCleanupRecipe).mockResolvedValue({ success: false, code: "VALIDATION", error: "Check the recipe values." })
    renderSheet({ recipeId: "never-watched-movies" })
    expect(await screen.findByText("Check the recipe values.")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-recipe-loading")).toBeInTheDocument()
  })

  it("leaves out the history and data line, the largest matches and a grace chip when they are not known", async () => {
    jest.mocked(previewCleanupRecipe).mockImplementation(async (input) => ({
      success: true, data: { ...preview(input), historyStart: null, takenAt: null, largest: [], matches: 0, protectedCount: 1, globalProtections: 1 },
    }))
    renderSheet({ recipeId: "old-seasons", graceDays: 45 })
    expect(await screen.findByTestId("admin-cleanup-recipe-count")).toHaveTextContent("0")
    expect(screen.getByText("seasons of 777 checked")).toBeInTheDocument()
    expect(screen.queryByText(/Never means/)).not.toBeInTheDocument()
    expect(screen.queryByText("Largest matches")).not.toBeInTheDocument()
    expect(screen.getByText("1 global protection keeps 1 season safe.")).toBeInTheDocument()
    expect(within(screen.getByTestId("admin-cleanup-recipe-value-grace")).queryByRole("radio", { checked: true })).not.toBeInTheDocument()
    expect(lastValues()?.values).toMatchObject({ grace: "45" })
  })
})

describe("recipe zero result", () => {
  it("names the condition that removes the most at 0 matches, with the largest title that passes the others (UX 4.2.2 item 6)", async () => {
    jest.mocked(previewCleanupRecipe).mockImplementation(async (input) => ({
      success: true, data: { ...preview(input), matches: 0, largest: [],
        zero: { conditionId: "c1", sentence: "Last played more than 365 days ago, or never", leaves: 0, of: 777, largestBytes: String(12 * GiB) } },
    }))
    renderSheet({ recipeId: "never-watched-movies" })
    expect(await screen.findByText(/leaves 0 of 777/)).toHaveTextContent(
      "\"Last played more than 365 days ago, or never\" leaves 0 of 777. The largest movie that passes the other conditions is 12 GB.")
  })

  it("shows no zero line while the recipe has matches, or when no condition removes the most", async () => {
    jest.mocked(previewCleanupRecipe).mockImplementation(async (input) => ({
      success: true, data: { ...preview(input), zero: { conditionId: "c1", sentence: "Size more than 20 GB", leaves: 3, of: 777, largestBytes: null } },
    }))
    renderSheet({ recipeId: "never-watched-movies" })
    expect(await screen.findByTestId("admin-cleanup-recipe-count")).toBeInTheDocument()
    expect(screen.queryByText(/leaves 3 of 777/)).not.toBeInTheDocument()
  })
})

describe("recipe chip values", () => {
  it("uses the URL form of each chip as its option id", () => {
    const recipe = getRecipe("big-shows-nobody-plays")
    expect(recipe.keys.map((key) => key.chips.map((chip) => recipeValueParam(chip)))).toEqual([
      [String(50 * GiB), String(100 * GiB), String(250 * GiB)], ["180d", "365d", "2y"], ["14", "30", "60", "90"],
    ])
  })
})
