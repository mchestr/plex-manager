import { z } from "zod"

import { RewindCopyV3, RewindCopyV3Wire } from "../schema"

const copy = (overrides: Partial<RewindCopyV3Wire["archetype"]> = {}): RewindCopyV3Wire => ({
  decks: {
    number: "That's {{fact:time.daysHours}} of screen time.",
    bookends: null, topShows: null, topFilms: null, taste: null, people: null,
    clock: null, calendar: null, records: null, requests: null, standing: null, nextYear: null,
  },
  archetype: { id: "midnight-marathoner", tagline: "Up past the credits.", dedication: "Every reason comes from your history.", posterLineId: "mm.1", ...overrides },
  signOff: null,
})

describe("RewindCopyV3Wire", () => {
  it("is a provider-safe JSON schema: strict objects, nullable slots, no length keywords", () => {
    const json = JSON.stringify(z.toJSONSchema(RewindCopyV3Wire))
    expect(json).not.toMatch(/minLength|maxLength/)
    const schema = z.toJSONSchema(RewindCopyV3Wire) as { additionalProperties?: boolean; required?: string[] }
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(["decks", "archetype", "signOff"])
  })

  it("rejects extra keys", () => {
    expect(RewindCopyV3Wire.safeParse({ ...copy(), extra: 1 }).success).toBe(false)
  })
})

describe("RewindCopyV3", () => {
  it("accepts good copy", () => {
    expect(RewindCopyV3.safeParse(copy()).success).toBe(true)
  })

  it("rejects another archetype's poster line", () => {
    expect(RewindCopyV3.safeParse(copy({ posterLineId: "lo.1" })).success).toBe(false)
  })

  it("rejects runaway and empty text", () => {
    expect(RewindCopyV3.safeParse(copy({ tagline: "x".repeat(211) })).success).toBe(false)
    expect(RewindCopyV3.safeParse(copy({ dedication: "" })).success).toBe(false)
  })
})
