import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { CentrefoldPage } from "@/components/rewind/pages/centrefold"
import { PlayerProvider } from "@/components/rewind/stage/player-context"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { CentrefoldData } from "@/lib/rewind/pages/centrefold.schema"
import { registry } from "@/lib/rewind/registry"
import { ARCHETYPE_IDS, getArchetype } from "@/lib/wrapped/archetypes/catalogue"
import { scoreArchetypes } from "@/lib/wrapped/archetypes/scorers"
import { tokenIds } from "@/lib/wrapped/copy/render-copy"
import { whyReasons } from "@/lib/wrapped/copy/templates"

jest.mock("server-only", () => ({}))

let heavy: FixtureIssue

beforeAll(async () => {
  heavy = await fixtureIssue("heavy")
})

const centrefold = (issue: FixtureIssue) => issue.pages.find((p) => p.type === "centrefold")!.data as CentrefoldData

describe("whyReasons", () => {
  it("cites only each archetype's own evidence facts", () => {
    const scores = scoreArchetypes(heavy.stats)
    const shortlist = ARCHETYPE_IDS.map((id) => ({ id, evidence: scores[id].evidence }))
    for (const candidate of whyReasons(shortlist)) {
      const own = scores[candidate.id].evidence as string[]
      expect(candidate.name).toBe(getArchetype(candidate.id).name)
      expect(candidate.reasons.length).toBe(own.length)
      for (const reason of candidate.reasons) expect(tokenIds(reason).every((id) => own.includes(id))).toBe(true)
    }
  })

  it("keeps the heavy member's chosen archetype first in the shortlist, with its evidence", () => {
    const data = centrefold(heavy)
    expect(data.shortlist[0]).toEqual({ id: heavy.archetype!.id, evidence: heavy.archetype!.evidence })
    expect(data.shortlist.length).toBeGreaterThan(1)
  })
})

describe("WhySheet", () => {
  function renderOpen(onSend = jest.fn()) {
    render(
      <PlayerProvider value={onSend} sheet="why">
        <CentrefoldPage data={centrefold(heavy)} issue={issueContext(heavy)} />
      </PlayerProvider>
    )
    return screen.findByTestId("rewind-why-sheet")
  }

  it("lists the shortlist with plain reasons and the dedication, with no words disclosure", async () => {
    const sheet = await renderOpen()
    const candidates = within(sheet).getAllByTestId("rewind-why-candidate")
    expect(candidates).toHaveLength(centrefold(heavy).shortlist.length)
    expect(candidates[0]).toHaveTextContent(`${heavy.facts["archetype.name"]!.display}, your archetype`)
    expect(candidates[0]).toHaveTextContent(`${heavy.facts["hours.afterDarkShare"]!.display} of your plays started between 10 PM and 4 AM.`)
    expect(sheet).toHaveTextContent(/For .+|Wear it well\./)
    expect(within(sheet).queryByTestId("rewind-why-disclosure")).toBeNull()
    expect(sheet).not.toHaveTextContent(/comes from a template|Every reason here/)
  })

  it("closes through the player on Escape", async () => {
    const send = jest.fn()
    await renderOpen(send)
    await userEvent.setup().keyboard("{Escape}")
    expect(send).toHaveBeenCalledWith({ type: "CLOSE_SHEET" })
  })

  it("is reachable from the registry's selected page", () => {
    expect(registry.centrefold.schema.safeParse(centrefold(heavy)).success).toBe(true)
  })
})
