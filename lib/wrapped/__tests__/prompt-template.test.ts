jest.mock("@/actions/prompts", () => ({
  getActivePromptTemplate: jest.fn().mockResolvedValue(null),
}))

import {
  generateSystemPrompt,
  generateWrappedPrompt,
  getAvailablePlaceholders,
  getDefaultPromptTemplate,
} from "@/lib/wrapped/prompt-template"
import { suggestArchetypes } from "@/lib/wrapped/archetype-scoring"

import { buildStatistics } from "./fixtures"

describe("generateWrappedPrompt", () => {
  it("renders the default template with derived-stat placeholders", async () => {
    const prompt = await generateWrappedPrompt("Mike", 2026, buildStatistics())

    expect(prompt).toContain("Mike")
    expect(prompt).toContain("2026")
    expect(prompt).toContain("12 consecutive days")
    expect(prompt).toContain("11 PM")
    expect(prompt).toContain("Top 5%")
    expect(prompt).not.toContain("{{")
  })

  it("includes the data-ranked archetype shortlist with evidence", async () => {
    const statistics = buildStatistics()
    const prompt = await generateWrappedPrompt("Mike", 2026, statistics)

    const shortlist = suggestArchetypes(statistics)
    expect(shortlist.length).toBeGreaterThanOrEqual(3)
    for (const candidate of shortlist) {
      expect(prompt).toContain(candidate.id)
      expect(prompt).toContain(candidate.name)
      expect(prompt).toContain(candidate.evidence)
    }
  })

  it("renders empty conditional sections when data is missing", async () => {
    const statistics = buildStatistics({
      derived: undefined,
      percentile: undefined,
    })

    const prompt = await generateWrappedPrompt(
      "Mike",
      2026,
      statistics,
      "{{derivedStatsSection}}|{{percentileSection}}|{{peakDayOfWeek}}"
    )

    expect(prompt).toBe("||Unknown")
  })

  it("resolves new derived placeholders individually", async () => {
    const prompt = await generateWrappedPrompt(
      "Mike",
      2026,
      buildStatistics(),
      "streak={{longestStreak}} peak={{peakHour}} day={{peakDayOfWeek}}"
    )

    expect(prompt).toContain("streak=12 consecutive days")
    expect(prompt).toContain("peak=11 PM")
    expect(prompt).toContain("day=Saturday")
  })

  it("resolves deprecated placeholders to empty strings", async () => {
    const template =
      "a{{overseerrSectionJson}}b{{overseerrAnimationDelay}}c{{insightsAnimationDelay}}d{{funFactsAnimationDelay}}e{{serverStatsFacts}}f{{serverStatsContent}}g"

    const prompt = await generateWrappedPrompt(
      "Mike",
      2026,
      buildStatistics(),
      template
    )

    expect(prompt).toBe("abcdefg")
  })
})

describe("generateSystemPrompt", () => {
  it("describes the creative fields without JSON scaffolding", () => {
    const prompt = generateSystemPrompt()

    expect(prompt).toContain("archetype")
    expect(prompt).toContain("narratives")
    expect(prompt).toContain("<highlight>")
    // No v1 JSON output scaffolding or LLM-owned pacing
    expect(prompt).not.toContain("animationDelay")
    expect(prompt).not.toContain('"sections"')
  })
})

describe("getAvailablePlaceholders", () => {
  it("documents every placeholder the default template uses", async () => {
    const documented = new Set(
      getAvailablePlaceholders().map((p) => p.placeholder)
    )
    const used = getDefaultPromptTemplate().match(/\{\{[a-zA-Z]+\}\}/g) || []

    for (const placeholder of used) {
      expect(documented).toContain(placeholder)
    }
  })

  it("marks legacy placeholders as deprecated", () => {
    const deprecated = getAvailablePlaceholders().filter((p) =>
      p.description.startsWith("DEPRECATED")
    )

    expect(deprecated.map((p) => p.placeholder)).toEqual(
      expect.arrayContaining([
        "{{overseerrSectionJson}}",
        "{{insightsAnimationDelay}}",
        "{{serverStatsContent}}",
      ])
    )
  })
})
