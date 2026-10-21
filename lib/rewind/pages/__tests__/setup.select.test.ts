/**
 * 13 Setup's selection (design 4.3, D5, NFR-7): 20 plays, meters above 0%,
 * and no path to a player, an address or a device id.
 */

import { FIXTURE_IDS, fixtureIssue, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { SETUP_METERS, SetupDataSchema } from "@/lib/rewind/pages/setup.schema"
import { setupPage } from "@/lib/rewind/pages/setup"
import type { SelectContext } from "@/lib/rewind/registry"
import { play } from "@/lib/wrapped/stats/__tests__/build-events"
import { computeDevices } from "@/lib/wrapped/stats/devices"

import { factsFor, FORBIDDEN_KEY, keysOf, selectContext } from "./helpers/server-act"

jest.mock("server-only", () => ({}))

const issues: Record<string, FixtureIssue> = {}

beforeAll(async () => {
  for (const id of FIXTURE_IDS) issues[id] = await fixtureIssue(id)
})

const plays = (count: number) => Array.from({ length: count }, (_, i) => play({ at: "2026-03-01T20:00", zone: "UTC", film: `${i + 1}` }))

/** The median member with their devices rebuilt from `count` plays. */
function selectWith(count: number) {
  const base = issues.median
  const stats = { ...base.stats, devices: computeDevices(plays(count), () => undefined) }
  return setupPage.select(factsFor(stats), selectContext(base, { stats }))
}

describe("13 Setup select", () => {
  it("runs on all 20 fixtures", () => {
    expect(FIXTURE_IDS).toHaveLength(20)
  })

  it.each(FIXTURE_IDS)("%s: returns valid data exactly when the member has 20 plays", (id) => {
    const issue = issues[id]
    const data = setupPage.select(issue.facts, selectContext(issue))
    expect(data !== null).toBe(issue.stats.devices.eligible)
    if (data) expect(SetupDataSchema.safeParse(data).success).toBe(true)
  })

  it("is null at 19 plays and kept at 20", () => {
    expect(selectWith(19)).toBeNull()
    expect(selectWith(20)).toEqual({ meters: ["setup.directPlayShare", "setup.homeShare"] })
  })

  it("draws no meter for a share of 0%", () => {
    const heavy = issues.heavy
    expect(heavy.facts["setup.fourKShare"]?.value).toBe(0)
    expect(setupPage.select(heavy.facts, selectContext(heavy))!.meters).not.toContain("setup.fourKShare")
  })

  it("reads no player, address or device id", () => {
    const ctx: SelectContext = selectContext(issues.heavy)
    const devices = ctx.stats.devices
    if (!devices.eligible) throw new Error("heavy has a Setup page")
    // @ts-expect-error DeviceStats carries no player name, so Setup's selector cannot print one (NFR-7)
    expect(devices.player).toBeUndefined()
    // @ts-expect-error nor an IP address
    expect(devices.ipAddress).toBeUndefined()
    // @ts-expect-error nor a machine id
    expect(devices.machineId).toBeUndefined()
    const data = setupPage.select(issues.heavy.facts, ctx)
    expect(keysOf(data).filter((key) => FORBIDDEN_KEY.test(key))).toEqual([])
    expect(data!.meters.every((id) => (SETUP_METERS as readonly string[]).includes(id))).toBe(true)
  })

  it("prints no share card and summarises the page deterministically", () => {
    expect(setupPage.share.facts).toEqual([])
    const heavy = issues.heavy
    expect(setupPage.srSummary(setupPage.select(heavy.facts, selectContext(heavy))!, heavy.facts)).toBe(
      "91% of your plays were direct play, with no transcoding. 89% were watched at home. Most of your viewing was on Apple TV, in Plex for Apple TV."
    )
  })
})
