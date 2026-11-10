/**
 * The Rules tab (UX 4.1, 8.2, 10.2, plan 2.3): first use with no rule (the
 * off alert, the steps, the library tiles, the gallery heading, the source
 * line with Refresh data now, the ten recipes and the blank card), and
 * normal use (the batch alert, the stat tiles, the "Rules" heading with the
 * source line and the rule cards in the loader's order). The batch alert
 * words deletion batches first, then entry batches.
 */

import { render, screen, within } from "@testing-library/react"

import { RulesTab, rulesLine } from "@/components/admin/cleanup/rules/rules-tab"
import { buildSourceStatuses } from "@/lib/cleanup/__tests__/helpers/builders"
import { RECIPE_IDS } from "@/lib/cleanup/constants"
import { getRecipe } from "@/lib/cleanup/recipes"
import type { OverviewBatch, RecipeCardData, RuleCardData } from "@/lib/cleanup/types/rule-parts"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))
jest.mock("@/lib/settings/app-settings", () => ({ getFormatSettings: jest.fn().mockResolvedValue({ timeZone: "UTC", locale: "en-US" }) }))
jest.mock("@/actions/admin/cleanup-settings", () => ({ startCleanupFirstRead: jest.fn().mockResolvedValue({ success: true, data: { queued: false } }), refreshCleanupData: jest.fn() }))
jest.mock("@/actions/admin/cleanup-rules", () => ({
  duplicateCleanupRule: jest.fn(),
  runCleanupRuleDryRun: jest.fn(),
  deleteCleanupRule: jest.fn(),
  moveCleanupRuleToDryRun: jest.fn(),
  setCleanupRuleReviewFirst: jest.fn(),
}))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
// The Sheet has its own tests; here it only has to be there
jest.mock("@/components/admin/cleanup/new-rule/new-rule-sheet", () => ({ NewRuleSheet: () => null }))

const GB = 1024 ** 3
const NOW = Date.parse("2026-11-08T12:00:00.000Z")

const recipes: RecipeCardData[] = RECIPE_IDS.map((id) => {
  const recipe = getRecipe(id)
  return { id, name: recipe.name, level: recipe.levels.length > 1 ? "movieOrShow" : recipe.levels[0], sentence: [{ text: recipe.name }], keyValues: [],
    note: null, today: { count: 10, bytes: String(GB), altCount: 2 }, needs: [], posters: [] }
})

function rule(id: string, name: string, mode: RuleCardData["mode"]): RuleCardData {
  return { id, name, mode, level: "movie", revision: 1, sentence: [{ text: `${name}.` }], posters: [], waitingBatch: null, footer: null,
    facts: { matches: { count: 3, bytes: String(3 * GB), growthWeeks: null, newSinceLastRun: null }, dryRuns: { count: 2, sinceDay: null, min: 3, max: 3, steady: true },
      leaving: null, waiting: null, deleted: null } }
}

function overview(overrides: Partial<CleanupOverviewData> = {}): CleanupOverviewData {
  return {
    feature: { enabled: false, enabledAt: null, pausedAt: null, pausedBy: null, redis: true },
    sources: buildSourceStatuses(),
    snapshot: { id: "snap-1", takenAt: "2026-11-08T03:07:00.000Z", finishedAt: "2026-11-08T03:09:00.000Z", reading: false },
    blocks: [],
    library: { movies: { count: 780, bytes: String(5000 * GB) }, shows: { count: 636, bytes: String(52000 * GB), seasons: 2000 }, freeBytes: null, totalBytes: null,
      growthBytesPerMonth: null },
    stats: { leaving: { count: 0, bytes: "0", nextLeaveAt: null }, waiting: null, freed30d: { count: 0, bytes: "0", level: null } },
    batches: [],
    rules: [],
    recipes,
    defaults: { graceDays: 30 },
    ...overrides,
  }
}

const batch = (overrides: Partial<OverviewBatch>): OverviewBatch => ({
  id: "deletion-rule-rf", kind: "deletion", ruleId: "rule-rf", ruleName: "Big shows nobody plays", level: "show", count: 6, bytes: String(1270 * GB),
  dueAt: "2026-11-08", dueSince: "2026-11-08", ...overrides,
})

async function renderTab(data: CleanupOverviewData) {
  jest.useFakeTimers({ now: NOW, doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "nextTick"] })
  render(await RulesTab({ data }))
}

afterEach(() => jest.useRealTimers())

describe("RulesTab first use", () => {
  it("shows the off alert, the steps, the library tiles, the gallery and the blank card, and no rule part", async () => {
    await renderTab(overview())

    expect(screen.getByTestId("admin-cleanup-alert-off")).toHaveTextContent("Media cleanup is off")
    expect(screen.getByTestId("admin-cleanup-alert-off-settings")).toHaveAttribute("href", "/admin/cleanup?tab=settings&section=cleanup-feature")
    const steps = within(screen.getByTestId("admin-cleanup-steps")).getAllByRole("listitem")
    expect(steps.map((step) => step.textContent)).toEqual([
      "1Step 1: Pick a recipeSet 2 or 3 values and see today's matches. The rule saves in Dry run.",
      "2Step 2: Watch a dry runEach night records the matches of the rule. Check the matches and why each one matched.",
      "3Step 3: Turn it onMatches wait in Leaving soon for 30 days. Members can keep them. Then Radarr or Sonarr deletes them.",
    ])
    expect(screen.getByTestId("admin-cleanup-library-tiles")).toHaveTextContent("780movies")
    expect(screen.getByRole("heading", { level: 2, name: "Start with a recipe" })).toBeInTheDocument()
    expect(screen.getByText("Each recipe makes a normal rule that you can change. Counts are for this server today.")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-data-timestamp")).toHaveTextContent("3:07 AM today")
    expect(screen.getByTestId("admin-cleanup-refresh-data")).toBeInTheDocument()
    const cards = within(screen.getByTestId("admin-cleanup-recipes")).getAllByTestId(/^admin-cleanup-recipe-[a-z-]+$/).filter((el) => el.dataset.slot === "card")
    expect(cards.map((el) => el.dataset.testid)).toEqual([...RECIPE_IDS.map((id) => `admin-cleanup-recipe-${id}`), "admin-cleanup-recipe-blank"])
    expect(screen.getByTestId("admin-cleanup-recipe-blank-start")).toHaveAttribute("href", "/admin/cleanup/rules/new?level=movie")
    expect(screen.getByTestId("admin-cleanup-recipe-blank")).toHaveTextContent(
      "Pick the level and the library. The editor starts with one condition, Added more than 90 days ago, and the global protections."
    )
    expect(screen.queryByTestId("admin-cleanup-stats")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-rules")).not.toBeInTheDocument()
  })

  it("leaves out the off alert while the feature is on", async () => {
    await renderTab(overview({ feature: { enabled: true, enabledAt: "2026-11-01T00:00:00.000Z", pausedAt: null, pausedBy: null, redis: true } }))

    expect(screen.queryByTestId("admin-cleanup-alert-off")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-recipes")).toBeInTheDocument()
  })
})

describe("RulesTab normal use", () => {
  const rules = [rule("rule-rf", "Big shows nobody plays", "reviewFirst"), rule("rule-dry", "Movies nobody watches", "dryRun"), rule("rule-auto", "Old seasons nobody plays", "automatic")]

  it("shows the batch alert, the stat tiles, the Rules heading with the source line, and the cards in the loader's order", async () => {
    await renderTab(overview({ rules, batches: [batch({})] }))

    expect(screen.getByTestId("admin-cleanup-alert-batch")).toHaveTextContent(
      "6 shows wait for your approvalBig shows nobody plays reached the leave date today: 1.24 TB. Nothing is deleted until you approve."
    )
    expect(screen.getByTestId("admin-cleanup-alert-batch-review")).toHaveAttribute("href", "/admin/cleanup?tab=leaving-soon")
    expect(screen.getByTestId("admin-cleanup-stats")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: "Rules" })).toBeInTheDocument()
    expect(screen.getByText(rulesLine(3))).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-sources")).toHaveTextContent("Library data from 3:07 AM today")
    // The Rules heading has no Refresh data now (shots/02-rules-normal.png)
    expect(screen.queryByTestId("admin-cleanup-refresh-data")).not.toBeInTheDocument()
    const cards = within(screen.getByTestId("admin-cleanup-rules")).getAllByTestId(/^admin-cleanup-rule-[a-z-]+$/).filter((el) => el.dataset.slot === "card")
    expect(cards.map((el) => el.dataset.testid)).toEqual(["admin-cleanup-rule-rule-rf", "admin-cleanup-rule-rule-dry", "admin-cleanup-rule-rule-auto"])
    expect(screen.queryByTestId("admin-cleanup-recipes")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-alert-off")).not.toBeInTheDocument()
  })

  it("shows no batch alert while no batch waits", async () => {
    await renderTab(overview({ rules }))
    expect(screen.queryByTestId("admin-cleanup-alert-batch")).not.toBeInTheDocument()
  })

  it("words older deletion batches with their days, sums the batches and names titles of mixed levels", async () => {
    await renderTab(overview({
      rules,
      batches: [
        batch({ dueSince: "2026-11-03", dueAt: "2026-11-05", count: 4, bytes: String(40 * GB) }),
        batch({ id: "deletion-rule-dry", ruleId: "rule-dry", ruleName: "Movies nobody watches", level: "movie", count: 1, bytes: String(10 * GB), dueSince: "2026-11-06", dueAt: "2026-11-06" }),
        batch({ id: "entry-rule-auto", kind: "entry", ruleId: "rule-auto", ruleName: "Old seasons nobody plays", level: "season", count: 52 }),
      ],
    }))

    const alert = screen.getByTestId("admin-cleanup-alert-batch")
    expect(alert).toHaveTextContent(
      "5 titles wait for your approval" +
        "Big shows nobody plays has titles that reached their leave date between Nov 3 and Nov 5: 40 GB. " +
        "Movies nobody watches has titles that reached their leave date on Nov 6: 10 GB. Nothing is deleted until you approve."
    )
    expect(screen.getByTestId("admin-cleanup-alert-batch-review")).toHaveTextContent("Review the batch")
  })

  it("words entry batches when no deletion batch waits", async () => {
    await renderTab(overview({ rules, batches: [batch({ id: "entry-rule-auto", kind: "entry", ruleName: "Old seasons nobody plays", level: "season", count: 52 })] }))

    expect(screen.getByTestId("admin-cleanup-alert-batch")).toHaveTextContent(
      "52 new matches wait to join Leaving soonOld seasons nobody plays found 52 new seasons last night. Nothing changes until you approve."
    )
    expect(screen.getByTestId("admin-cleanup-alert-batch-review")).toHaveTextContent("Review the matches")
  })

  it.each([
    [batch({ count: 1, level: "movie" }), /^1 movie waits for your approval/],
    [batch({ kind: "entry", count: 1, level: "movie" }), /^1 new match waits to join Leaving soon.+found 1 new movie last night\./],
  ])("words one waiting title and one new match", async (one, words) => {
    await renderTab(overview({ rules, batches: [one] }))
    expect(screen.getByTestId("admin-cleanup-alert-batch")).toHaveTextContent(words)
  })

  it("says one rule", () => {
    expect(rulesLine(1)).toBe("1 rule. A title that two rules match is in Leaving soon once, with the longer grace period.")
  })
})
