/**
 * @jest-environment node
 *
 * Card lines are fitted to 936 / (1 + CARD_SLACK), and CARD_SLACK covers the
 * overflow P2.14 measured on Satori (lib/rewind/cards/measurements.json).
 */
import titles from "@/evals/rewind/data/titles-200.json"
import { CARD_MEASURE, CARD_TITLE_ROLES } from "@/lib/rewind/cards/__fixtures__/mockup-cards"
import measurements from "@/lib/rewind/cards/measurements.json"
import { CARD_SLACK, fitLines } from "@/lib/rewind/typeset/fit-lines"

describe("CARD_SLACK", () => {
  it("is at least the measured worst overflow plus 0.5%", () => {
    expect(measurements.slack.cardSlack).toBe(CARD_SLACK)
    expect(CARD_SLACK).toBeGreaterThanOrEqual(measurements.slack.recommended)
  })

  it.each(Object.entries(CARD_TITLE_ROLES))("keeps every predicted %s line, plus the slack, inside 936 px", (_, { opts, text }) => {
    let lines = 0
    for (const { title } of titles.titles) {
      const fit = fitLines(text(title), opts)
      if (fit.safeMode) continue
      for (const line of fit.lines) {
        expect(line.width * (1 + CARD_SLACK)).toBeLessThanOrEqual(CARD_MEASURE + 0.01)
        lines++
      }
    }
    expect(lines).toBeGreaterThan(175)
  })
})
