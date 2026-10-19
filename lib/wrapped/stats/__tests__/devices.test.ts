/**
 * @jest-environment node
 */

/**
 * The setup page's facts (P2.8, NFR-7).
 */

import { computeDevices } from "@/lib/wrapped/stats/devices"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import { lookupFor, meta } from "./build-lookups"
import { play, ZONES } from "./build-events"

describe.each(ZONES)("computeDevices in %s", (zone) => {
  const plays = (count: number, fields: Partial<PlayEvent> = {}): PlayEvent[] =>
    Array.from({ length: count }, (_, i) => ({ ...play({ at: "2026-03-01T20:00", zone, film: `${i + 1}` }), ...fields }))

  it("computes the shares and the top platform and product", () => {
    const events = [
      ...plays(15, { platform: "tvOS", product: "Plex for Apple TV" }),
      ...plays(5, { transcodeDecision: "transcode", location: "wan", platform: "Android", product: "Plex for Android" }),
    ]
    const setup = computeDevices(events, () => undefined)
    expect(setup).toEqual({
      eligible: true,
      directPlayShare: 0.75,
      homeShare: 0.75,
      topPlatform: "tvOS",
      topProduct: "Plex for Apple TV",
      fourKShare: null,
    })
  })

  it("gives a member whose plays are all remote a 0% home share", () => {
    const setup = computeDevices(plays(20, { location: "wan" }), () => undefined)
    expect(setup.eligible && setup.homeShare).toBe(0)
  })

  it("reads 4K from the cache's resolution, out of the plays that have one", () => {
    const events = plays(20)
    const rows = Object.fromEntries(events.map((e, i) => [e.ratingKey, meta({ videoResolution: i < 5 ? "4k" : i < 10 ? "1080" : null })]))
    const setup = computeDevices(events, lookupFor(events, rows))
    expect(setup.eligible && setup.fourKShare).toBe(0.5)
  })

  it("leaves fields no play reports null, and is ineligible below 20 plays", () => {
    const setup = computeDevices(plays(20, { transcodeDecision: null, location: null }), () => undefined)
    expect(setup).toMatchObject({ directPlayShare: null, homeShare: null, topPlatform: null })
    expect(computeDevices(plays(19), () => undefined)).toEqual({ eligible: false })
  })

  it("has no player, IP address or machine id to read", () => {
    const [e] = plays(1)
    // @ts-expect-error PlayEvent carries no player name (NFR-7)
    expect(e.player).toBeUndefined()
    // @ts-expect-error PlayEvent carries no IP address (NFR-7)
    expect(e.ipAddress).toBeUndefined()
  })
})
