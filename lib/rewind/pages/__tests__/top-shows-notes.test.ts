/**
 * Top shows' desktop Notes and hiding (P7.4 with P7.7): a hidden series
 * leaves the stored `more` list once the no-LLM regeneration runs, and the
 * Notes leave it out at once before that.
 */

import { loadFixtures } from "@/evals/rewind/__tests__/load-fixtures"
import { fixtureInputs } from "@/evals/rewind/__tests__/member-stats"
import { fixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { textOf, type ArticleBlock } from "@/lib/rewind/article/blocks"
import { topShowsPage } from "@/lib/rewind/pages/top-shows"
import type { TopShowsData } from "@/lib/rewind/pages/top-lists.schema"
import { ratingKeyOf } from "@/lib/rewind/pages/title-key"
import { computeMemberStats } from "@/lib/wrapped/stats/compute"

jest.mock("server-only", () => ({}))

const tableRows = (blocks: ArticleBlock[]) => blocks.flatMap((b) => (b.kind === "table" ? b.table.rows : []))
const headingOf = (blocks: ArticleBlock[]) => blocks.flatMap((b) => (b.kind === "heading" ? [textOf(b.text)] : []))[0]

describe("Top shows Notes and hidden titles", () => {
  it("drops a hidden series from `more` when the issue is regenerated", async () => {
    const fixture = loadFixtures().find((f) => f.id === "heavy")!
    const inputs = await fixtureInputs(fixture)
    const before = computeMemberStats(inputs.events, inputs.ctx, inputs.sources)
    const target = before.titles.moreSeries[0]
    expect(target).toBeDefined()

    const hiddenKeys = new Set([...inputs.ctx.hiddenKeys, ratingKeyOf(target.key)])
    const stats = computeMemberStats(inputs.events, { ...inputs.ctx, hiddenKeys }, inputs.sources)
    const data = topShowsPage.select({}, { edition: "full", archetype: null, disabledPages: [], stats })!
    expect(data.more?.map((row) => row.key)).not.toContain(target.key)
    expect(data.more!.length).toBe(before.titles.moreSeries.length - 1)
  })

  it("leaves a series hidden since generation out of the Notes, renumbering the rest", async () => {
    const heavy = await fixtureIssue("heavy")
    const data = heavy.pages.find((p) => p.type === "top-shows")!.data as TopShowsData
    const ctx = { locale: "en-US" } as const
    const all = topShowsPage.notes!(data, heavy.facts, ctx)
    const hiddenRow = data.more![0]

    const notes = topShowsPage.notes!(data, heavy.facts, { ...ctx, hiddenKeys: new Set([ratingKeyOf(hiddenRow.key), ratingKeyOf(data.rows[0].key)]) })
    const rows = tableRows(notes)
    expect(rows).toHaveLength(tableRows(all).length - 2)
    expect(rows.map((row) => row[1])).not.toContain(hiddenRow.title)
    expect(rows.map((row) => row[1])).not.toContain(heavy.facts["series[1].title"]!.display)
    expect(rows.map((row) => row[0])).toEqual(rows.map((_row, i) => String(i + 1)))
    expect(headingOf(notes)).toBe(`All ${rows.length} series, ranked by time watched`)
  })
})
