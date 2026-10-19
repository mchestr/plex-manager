/**
 * @jest-environment node
 */

/**
 * e2e/helpers/deterministic.ts seeds the page's Math.random for the visual
 * baselines (P1.6), so the generator must return a fixed sequence.
 */

import { mulberry32, VISUAL_SEED } from "@/e2e/helpers/deterministic"

describe("mulberry32", () => {
  it("matches the documented example", () => {
    const random = mulberry32(1)
    expect(random()).toBe(0.6270739405881613)
    expect(random()).toBe(0.002735721180215478)
  })

  it("returns the same fixed sequence for the visual seed every time", () => {
    const sequence = (seed: number) => {
      const random = mulberry32(seed)
      return [random(), random(), random()]
    }
    expect(sequence(VISUAL_SEED)).toEqual([0.8011838176753372, 0.9645610307343304, 0.6071008702274412])
    expect(sequence(VISUAL_SEED)).toEqual(sequence(VISUAL_SEED))
  })

  it("stays in [0, 1)", () => {
    const random = mulberry32(VISUAL_SEED)
    for (let i = 0; i < 1000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it("survives being injected into a page as source text", () => {
    // makeDeterministic injects `(${mulberry32.toString()})(seed)`.
    const injected = new Function(`return (${mulberry32.toString()})(1)`)() as () => number
    expect(injected()).toBe(0.6270739405881613)
  })
})
