/**
 * A rule card of the Rules tab (UX 4.1.3, 8.2, 10.2): the header with the
 * mode badge, the sentence and the next step by mode, the three facts of
 * each mode, and the one footer line in its order: a safety stop, "Ready to
 * turn on", an overlap with "Open history", a rescue, and "No dry run of
 * this version yet".
 */

import { render, screen, within } from "@testing-library/react"

import { RuleCard } from "@/components/admin/cleanup/rules/rule-card"
import { dayWords } from "@/components/admin/cleanup/rules/rule-card-facts"
import type { RuleCardData, RuleFacts, RuleFooter } from "@/lib/cleanup/types/rule-parts"
import { bindFormat } from "@/lib/utils/format"

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }))
jest.mock("@/actions/admin/cleanup-rules", () => ({
  duplicateCleanupRule: jest.fn(),
  runCleanupRuleDryRun: jest.fn(),
  deleteCleanupRule: jest.fn(),
  moveCleanupRuleToDryRun: jest.fn(),
  setCleanupRuleReviewFirst: jest.fn(),
}))
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))

const TODAY = "2026-11-08"
const GB = 1024 ** 3
const bytes = (gb: number) => String(Math.round(gb * GB))

const FACTS: RuleFacts = {
  matches: { count: 197, bytes: bytes(1331), growthWeeks: 4, newSinceLastRun: null },
  dryRuns: { count: 12, sinceDay: "2026-10-27", min: 191, max: 199, steady: true },
  leaving: null,
  waiting: null,
  deleted: null,
}

function card(overrides: Partial<RuleCardData> = {}): RuleCardData {
  return {
    id: "rule-dry",
    name: "Movies nobody watches",
    mode: "dryRun",
    level: "movie",
    revision: 1,
    sentence: [{ text: "Movies in the " }, { text: "Movies", strong: true }, { text: " library that were added more than " }, { text: "365 days", strong: true }, { text: " ago." }],
    posters: ["101", "102", "103", "104"],
    facts: FACTS,
    footer: null,
    waitingBatch: null,
    ...overrides,
  }
}

const renderCard = (data: RuleCardData, redis = true) => render(<RuleCard card={data} redis={redis} today={TODAY} />)
const fact = (id: string, name: string) => screen.getByTestId(`admin-cleanup-rule-${id}-fact-${name}`)

describe("RuleCard header", () => {
  it("shows the name, the mode badge and the sentence with its values in bold", () => {
    renderCard(card())

    expect(screen.getByRole("heading", { level: 3, name: "Movies nobody watches" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-rule-rule-dry-mode")).toHaveTextContent("Dry run")
    const sentence = screen.getByTestId("admin-cleanup-rule-rule-dry-sentence")
    expect(sentence).toHaveTextContent("Movies in the Movies library that were added more than 365 days ago.")
    expect(within(sentence).getByText("365 days").tagName).toBe("STRONG")
    expect(screen.getByTestId("admin-cleanup-rule-rule-dry-posters").children).toHaveLength(4)
  })

  it("offers Turn on..., Edit and the menu on a Dry run rule, in that order", () => {
    renderCard(card())

    const turnOn = screen.getByTestId("admin-cleanup-rule-rule-dry-turn-on")
    expect(turnOn).toHaveAttribute("href", "/admin/cleanup/rules/rule-dry/turn-on")
    expect(turnOn).toHaveAccessibleName("Turn on Movies nobody watches")
    expect(screen.getByTestId("admin-cleanup-rule-rule-dry-edit")).toHaveAttribute("href", "/admin/cleanup/rules/rule-dry")
    expect(screen.getByTestId("admin-cleanup-rule-rule-dry-edit")).toHaveAccessibleName("Edit Movies nobody watches")
    expect(screen.getByTestId("admin-cleanup-rule-rule-dry-menu")).toHaveAccessibleName("More actions for Movies nobody watches")
    const order = ["turn-on", "edit", "menu"].map((part) => screen.getByTestId(`admin-cleanup-rule-rule-dry-${part}`))
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByTestId("admin-cleanup-rule-rule-dry-review")).not.toBeInTheDocument()
  })

  it("disables Turn on... without Redis, focusable with the reason", () => {
    renderCard(card(), false)

    const turnOn = screen.getByTestId("admin-cleanup-rule-rule-dry-turn-on")
    expect(turnOn.tagName).toBe("BUTTON")
    expect(turnOn).toHaveAttribute("aria-disabled", "true")
    expect(turnOn).toHaveAccessibleDescription("Redis is not set up.")
  })

  it("offers Review the batch on a live rule with a waiting batch, and no next step without one", () => {
    const { unmount } = renderCard(card({ id: "rule-rf", name: "Big shows nobody plays", mode: "reviewFirst", level: "show", waitingBatch: "deletion" }))

    const review = screen.getByTestId("admin-cleanup-rule-rule-rf-review")
    expect(review).toHaveAttribute("href", "/admin/cleanup?tab=leaving-soon")
    expect(review).toHaveAccessibleName("Review the batch: Big shows nobody plays")
    expect(screen.queryByTestId("admin-cleanup-rule-rule-rf-turn-on")).not.toBeInTheDocument()
    unmount()

    renderCard(card({ id: "rule-auto", mode: "automatic", level: "season" }))
    expect(screen.queryByTestId("admin-cleanup-rule-rule-auto-review")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-rule-rule-auto-turn-on")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-rule-rule-auto-edit")).toBeInTheDocument()
  })

  it("draws no poster strip for a rule that matches nothing", () => {
    renderCard(card({ posters: [] }))
    expect(screen.queryByTestId("admin-cleanup-rule-rule-dry-posters")).not.toBeInTheDocument()
  })
})

describe("RuleCard facts by mode", () => {
  it("shows the matches, the dry runs of this version and what members see on a Dry run rule", () => {
    renderCard(card())

    expect(fact("rule-dry", "matches")).toHaveTextContent("Matches today197 movies, 1.3 TBUp to, about 4 weeks of growth")
    expect(fact("rule-dry", "dry-runs")).toHaveTextContent("Dry runs12 since Oct 27Between 191 and 199 matches")
    expect(fact("rule-dry", "members")).toHaveTextContent("Members seeNothing yetA dry run changes nothing")
  })

  it("names one count when every dry run found the same number, never 'Between 21 and 21'", () => {
    renderCard(card({ facts: { ...FACTS, dryRuns: { ...FACTS.dryRuns, min: 21, max: 21 } } }))
    expect(fact("rule-dry", "dry-runs")).toHaveTextContent("Dry runs12 since Oct 27Matches stayed at 21")
  })

  it("says Nothing yet before the first dry run of this version, and leaves out an unknown growth", () => {
    renderCard(card({ facts: { ...FACTS, matches: { ...FACTS.matches, count: 1, bytes: bytes(2), growthWeeks: null }, dryRuns: { count: 0, sinceDay: null, min: null, max: null, steady: false } } }))

    expect(fact("rule-dry", "matches")).toHaveTextContent(/^Matches today1 movie, 2 GB$/)
    expect(fact("rule-dry", "dry-runs")).toHaveTextContent(/^Dry runsNothing yet$/)
  })

  it("shows the matches with the new ones, Leaving soon and the batch that waits on a Review first rule", () => {
    renderCard(card({
      id: "rule-rf", mode: "reviewFirst", level: "show",
      facts: {
        ...FACTS,
        matches: { count: 24, bytes: bytes(4710), growthWeeks: null, newSinceLastRun: 3 },
        leaving: { count: 21, bytes: bytes(3994), turnedOnAt: "2026-10-09T15:00:00.000Z", nextLeaveOn: "2026-12-02", nextCount: 4 },
        waiting: { count: 6, bytes: bytes(1270), dueOn: TODAY, dueToday: true },
      },
    }))

    expect(fact("rule-rf", "matches")).toHaveTextContent("Matches today24 shows, 4.6 TB3 new since the last run")
    expect(fact("rule-rf", "leaving")).toHaveTextContent("In Leaving soon21 shows, 3.9 TBTurned on Oct 9")
    expect(fact("rule-rf", "waiting")).toHaveTextContent("Waiting for you6 shows, due today1.24 TB")
  })

  it("names the day of an older batch, and the next leave date while no batch waits", () => {
    const leaving = { count: 2, bytes: bytes(20), turnedOnAt: null, nextLeaveOn: "2026-12-02", nextCount: 2 }
    const { unmount } = renderCard(card({ id: "rule-rf", mode: "reviewFirst", facts: { ...FACTS, leaving, waiting: { count: 1, bytes: bytes(5), dueOn: "2026-11-03", dueToday: false } } }))
    expect(fact("rule-rf", "waiting")).toHaveTextContent("Waiting for you1 movie, due since Nov 35 GB")
    expect(fact("rule-rf", "leaving")).toHaveTextContent(/^In Leaving soon2 movies, 20 GB$/)
    unmount()

    renderCard(card({ id: "rule-rf", mode: "reviewFirst", facts: { ...FACTS, leaving, waiting: null } }))
    expect(fact("rule-rf", "waiting")).toHaveTextContent("Waiting for you0 moviesNext leave date: Dec 2")
  })

  it("shows the matches, Leaving soon with the next day, and what it deleted on an Automatic rule", () => {
    renderCard(card({
      id: "rule-auto", mode: "automatic", level: "season",
      facts: {
        ...FACTS,
        matches: { count: 33, bytes: bytes(690), growthWeeks: 2, newSinceLastRun: null },
        leaving: { count: 31, bytes: bytes(640), turnedOnAt: "2026-10-01T00:00:00.000Z", nextLeaveOn: "2026-11-19", nextCount: 12 },
        deleted: { count: 9, bytes: bytes(412), since: "2026-11-01" },
      },
    }))

    expect(fact("rule-auto", "matches")).toHaveTextContent(/^Matches today33 seasons, 690 GB$/)
    expect(fact("rule-auto", "leaving")).toHaveTextContent("In Leaving soon31 seasons, 640 GBNext: Nov 19, 12 seasons")
    expect(fact("rule-auto", "deleted")).toHaveTextContent("Deleted9 seasons, up to 412 GBSince Nov 1")
  })

  it("reads an Automatic rule with nothing in Leaving soon and nothing deleted", () => {
    renderCard(card({ id: "rule-auto", mode: "automatic", facts: { ...FACTS, leaving: null, deleted: null } }))

    expect(fact("rule-auto", "leaving")).toHaveTextContent(/^In Leaving soon0 movies, 0 GB$/)
    expect(fact("rule-auto", "deleted")).toHaveTextContent(/^Deleted0 movies, up to 0 GB$/)
  })

  it("names a day of another year with the year", () => {
    const f = bindFormat({ timeZone: "UTC", locale: "en-US" })
    expect(dayWords(f, "2025-12-02", TODAY)).toBe("Dec 2, 2025")
    expect(dayWords(f, "2026-12-02", TODAY)).toBe("Dec 2")
  })
})

describe("RuleCard footer", () => {
  const footerOf = (footer: RuleFooter | null, overrides: Partial<RuleCardData> = {}) => {
    renderCard(card({ footer, ...overrides }))
    return screen.queryByTestId(`admin-cleanup-rule-${overrides.id ?? "rule-dry"}-footer`)
  }

  it("names a safety stop of the rule first, with its cause", () => {
    const footer = footerOf({ kind: "block", block: { code: "sourceFailed", service: "sonarr", readAt: "2026-11-08T03:07:00.000Z" } })
    expect(footer).toHaveTextContent("Runs of this rule change nothing: Sonarr did not answer at 3:07 AM.")
  })

  it("says Ready to turn on with the steady dry runs since the change and the read time", () => {
    const footer = footerOf({ kind: "ready", dryRuns: 12, readAt: "2026-11-08T03:07:00.000Z" })
    expect(footer).toHaveTextContent("Ready to turn on: 12 steady dry runs since your change on Oct 27, and every source answered at 3:07 AM.")
  })

  it("leaves out an unknown change day and read time", () => {
    const footer = footerOf({ kind: "ready", dryRuns: 1, readAt: null }, { facts: { ...FACTS, dryRuns: { ...FACTS.dryRuns, count: 1, sinceDay: null } } })
    expect(footer).toHaveTextContent(/^Ready to turn on: 1 steady dry run\.$/)
  })

  it.each<[Extract<RuleFooter, { kind: "overlap" }>["overlap"], number, string]>([
    ["inShow", 2, "2 seasons are in shows that Big shows nobody plays also matches. A show never goes before its seasons."],
    ["inShow", 1, "1 season is in a show that Big shows nobody plays also matches. A show never goes before its seasons."],
    ["hasSeasons", 3, "3 shows have seasons that Big shows nobody plays also matches. A show never goes before its seasons."],
    ["hasSeasons", 1, "1 show has seasons that Big shows nobody plays also matches. A show never goes before its seasons."],
    ["same", 4, "4 seasons are also matched by Big shows nobody plays. A title that two rules match is in Leaving soon once, with the longer grace period."],
    ["same", 1, "1 season is also matched by Big shows nobody plays. A title that two rules match is in Leaving soon once, with the longer grace period."],
  ])("words an overlap of kind %s with %d titles, with Open history", (overlap, count, words) => {
    const footer = footerOf({ kind: "overlap", rule: { id: "rule-rf", name: "Big shows nobody plays" }, count, overlap }, { id: "rule-auto", mode: "automatic", level: "season" })
    expect(footer).toHaveTextContent(words)
    const history = screen.getByTestId("admin-cleanup-rule-rule-auto-history")
    expect(history).toHaveAttribute("href", "/admin/cleanup?tab=history")
    expect(history).toHaveAccessibleName("Open history: Movies nobody watches")
  })

  it.each([
    ["2026-11-08T10:00:00.000Z", "Rescued today: Fringe. A member played it."],
    ["2026-11-07T10:00:00.000Z", "Rescued yesterday: Fringe. A member played it."],
    ["2026-11-03T10:00:00.000Z", "Rescued on Nov 3: Fringe. A member played it."],
  ])("names the newest rescue at %s", (at, words) => {
    const footer = footerOf({ kind: "rescue", title: "Fringe", at, reason: "A member played it." }, { mode: "reviewFirst" })
    expect(footer).toHaveTextContent(words)
    expect(screen.queryByTestId("admin-cleanup-rule-rule-dry-history")).not.toBeInTheDocument()
  })

  it("says that no dry run of this version ran yet on a Dry run rule with no other line", () => {
    const footer = footerOf(null, { facts: { ...FACTS, dryRuns: { count: 0, sinceDay: null, min: null, max: null, steady: false } } })
    expect(footer).toHaveTextContent("No dry run of this version yet.")
  })

  it("draws no footer when no line applies", () => {
    expect(footerOf(null)).toBeNull()
    expect(screen.queryByText(/No dry run/)).not.toBeInTheDocument()
  })
})
