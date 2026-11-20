/**
 * A recipe card of the first-use gallery (UX 4.1.1, 8.2, 10.2): the level,
 * the name, the sentence with its key values as chips, the posters and the
 * note, and "Today" in its three states: no library data yet (a skeleton),
 * a missing service ("Needs Sonarr" with "Set up Sonarr"), and two levels
 * ("38 movies or 21 shows").
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { firstSentence, RecipeCard, recipeCount } from "@/components/admin/cleanup/rules/recipe-card"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"
import { bindFormat } from "@/lib/utils/format"

const GB = 1024 ** 3

function recipe(overrides: Partial<RecipeCardData> = {}): RecipeCardData {
  return {
    id: "never-watched-movies",
    name: "Never watched movies",
    level: "movie",
    sentence: [
      { text: "Movies in the " },
      { text: "Movies", strong: true },
      { text: " library that " },
      { text: "were never played", strong: true },
      { text: ", and " },
      { text: "were added more than 180 days ago", strong: true },
      { text: ". Never touch anything that a global protection keeps safe. Keep matches in Leaving soon for " },
      { text: "30 days", strong: true },
      { text: ", then delete each movie and its files in Radarr." },
    ],
    keyValues: ["180 days", "30 days"],
    note: "Good first rule. Its matches have no plays at all.",
    today: { count: 152, bytes: String(Math.round(921.6 * GB)) },
    needs: [],
    posters: ["11", "12", "13", "14", "15"],
    ...overrides,
  }
}

const card = () => screen.getByTestId("admin-cleanup-recipe-never-watched-movies")
const count = () => screen.getByTestId("admin-cleanup-recipe-never-watched-movies-count")

describe("RecipeCard", () => {
  it("shows the level, the name, what the recipe matches with its key values as chips, the posters and the note", () => {
    render(<RecipeCard recipe={recipe()} onUse={jest.fn()} />)

    expect(within(card()).getByText("Movies", { selector: "p" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 3, name: "Never watched movies" })).toBeInTheDocument()
    // The first sentence only: the protections and the Then part are the same in every recipe
    const sentence = screen.getByTestId("admin-cleanup-recipe-never-watched-movies-sentence")
    expect(sentence).toHaveTextContent(/^Movies in the Movies library that were never played, and were added more than 180 days ago\.$/)
    const chip = within(sentence).getByText("180 days")
    expect(chip).toHaveAttribute("data-slot", "value-chip")
    expect(chip.parentElement).toHaveTextContent(/^were added more than 180 days ago$/)
    expect(chip.parentElement?.tagName).toBe("STRONG")
    // A strong part with no key value is bold, with no chip
    expect(within(sentence).getByText("Movies", { selector: "strong" })).not.toContainHTML("value-chip")
    expect(sentence.querySelectorAll('[data-slot="value-chip"]')).toHaveLength(1)
    expect(screen.getByTestId("admin-cleanup-recipe-never-watched-movies-posters").children).toHaveLength(5)
    expect(within(card()).getByText("Good first rule.").tagName).toBe("STRONG")
    expect(card()).toHaveTextContent("Good first rule. Its matches have no plays at all.")
  })

  it("counts today's matches and opens its recipe step", async () => {
    const user = userEvent.setup()
    const onUse = jest.fn()
    render(<RecipeCard recipe={recipe()} onUse={onUse} />)

    expect(count()).toHaveTextContent("152 movies, 921.6 GB")
    const use = screen.getByTestId("admin-cleanup-recipe-never-watched-movies-use")
    expect(use).toHaveAccessibleName("Use this recipe: Never watched movies")
    await user.click(use)
    expect(onUse).toHaveBeenCalledWith("never-watched-movies")
  })

  it("shows a skeleton for the count before the first library read", () => {
    render(<RecipeCard recipe={recipe({ today: null, posters: [] })} onUse={jest.fn()} />)

    expect(count()).toHaveAttribute("data-slot", "skeleton")
    expect(count()).toHaveAttribute("aria-hidden", "true")
    expect(screen.queryByTestId("admin-cleanup-recipe-never-watched-movies-posters")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-recipe-never-watched-movies-use")).toBeEnabled()
  })

  it("names a missing service and links to its settings instead of the recipe step", () => {
    render(<RecipeCard recipe={recipe({ id: "big-shows-nobody-plays", name: "Big shows nobody plays", level: "show", today: null, needs: ["sonarr"] })} onUse={jest.fn()} />)

    expect(screen.getByTestId("admin-cleanup-recipe-big-shows-nobody-plays-count")).toHaveTextContent("Needs Sonarr")
    const setup = screen.getByTestId("admin-cleanup-recipe-big-shows-nobody-plays-setup")
    expect(setup).toHaveTextContent("Set up Sonarr")
    expect(setup).toHaveAttribute("href", "/admin/settings#sonarr")
    expect(screen.queryByTestId("admin-cleanup-recipe-big-shows-nobody-plays-use")).not.toBeInTheDocument()
  })

  it("names every missing service and sets up the first", () => {
    render(<RecipeCard recipe={recipe({ id: "requested-never-watched", needs: ["overseerr", "tautulli"] })} onUse={jest.fn()} />)

    expect(screen.getByTestId("admin-cleanup-recipe-requested-never-watched-count")).toHaveTextContent("Needs Overseerr and Tautulli")
    expect(screen.getByTestId("admin-cleanup-recipe-requested-never-watched-setup")).toHaveTextContent("Set up Overseerr")
  })

  it("counts both levels of a two-level recipe", () => {
    render(<RecipeCard recipe={recipe({ id: "requested-never-watched", name: "Requested, then never watched", level: "movieOrShow", today: { count: 38, bytes: "1", altCount: 21 } })} onUse={jest.fn()} />)

    expect(within(screen.getByTestId("admin-cleanup-recipe-requested-never-watched")).getByText("Movies or whole shows")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-recipe-requested-never-watched-count")).toHaveTextContent(/^38 movies or 21 shows$/)
  })

  it("keeps a one-sentence note plain, and shows no note without one", () => {
    const { unmount } = render(<RecipeCard recipe={recipe({ note: "Only plex-manager knows who left." })} onUse={jest.fn()} />)
    expect(within(card()).getByText("Only plex-manager knows who left.").tagName).toBe("P")
    unmount()

    render(<RecipeCard recipe={recipe({ note: null })} onUse={jest.fn()} />)
    expect(card()).not.toHaveTextContent("Good first rule")
  })
})

describe("firstSentence", () => {
  it("ends at the first period of a plain part, keeps a period inside a value, and keeps a sentence without one", () => {
    expect(firstSentence([{ text: "Larger than " }, { text: "1.5 TB", strong: true }, { text: ". Then more." }])).toEqual([
      { text: "Larger than " },
      { text: "1.5 TB", strong: true },
      { text: "." },
    ])
    expect(firstSentence([{ text: "No end " }, { text: "here", strong: true }])).toEqual([{ text: "No end " }, { text: "here", strong: true }])
  })
})

describe("recipeCount", () => {
  const f = bindFormat({ timeZone: "UTC", locale: "en-US" })

  it("words one title, a season recipe, a two-level recipe without its show count, and no data", () => {
    expect(recipeCount({ level: "movie", today: { count: 1, bytes: String(2 * GB) } }, f)).toBe("1 movie, 2 GB")
    expect(recipeCount({ level: "season", today: { count: 212, bytes: String(6.8 * 1024 * GB) } }, f)).toBe("212 seasons, 6.8 TB")
    expect(recipeCount({ level: "movieOrShow", today: { count: 1, bytes: "0" } }, f)).toBe("1 movie or 0 shows")
    expect(recipeCount({ level: "movie", today: null }, f)).toBeNull()
  })
})
