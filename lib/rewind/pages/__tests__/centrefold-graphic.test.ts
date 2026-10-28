/**
 * @jest-environment node
 */

import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { graphicSummary } from "../centrefold"

describe("graphicSummary", () => {
  it("sets a meter against its own median fact", () => {
    const facts = {
      "records.deepestBinge.episodes": { value: 10, display: "10", unit: "count" },
      "records.deepestBinge.median": { value: 4, display: "4", unit: "count" },
    } satisfies RewindFactsV3
    expect(graphicSummary({ kind: "meter", fact: "records.deepestBinge.episodes", ratio: 1, median: 0.4 }, facts)).toBe(
      "10 episodes in your deepest binge, against the server's median of 4."
    )
  })
})
