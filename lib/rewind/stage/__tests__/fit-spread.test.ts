import { fitSpread, spreadColumns } from "../fit-stage"

const spread = (vw: number, vh: number) => fitSpread({ vw, vh, ...spreadColumns(vw) })

describe("fitSpread (design 4.7, P7.4)", () => {
  it("gives 1.1 at 1440 x 900 and about 0.9 at 1366 x 768", () => {
    expect(spread(1440, 900)).toBeCloseTo(1.1, 1)
    expect(spread(1366, 768)).toBeCloseTo(0.9, 1)
  })

  it("stays at 0.8 or more at 1024 x 768, the narrowest spread", () => {
    expect(spread(1024, 768)).toBeGreaterThanOrEqual(0.8)
  })

  it("never passes 1.1, however large the window", () => {
    expect(spread(2560, 1600)).toBe(1.1)
  })

  it("lets the column limit the scale when the rail and Notes take the width", () => {
    expect(fitSpread({ vw: 1200, vh: 1200, railW: 248, notesW: 500 })).toBeCloseTo((1200 - 48 - 248 - 500 - 160) / 390, 5)
  })

  it("narrows the rail and Notes on a narrow window", () => {
    expect(spreadColumns(1024)).toEqual({ railW: 176, notesW: 307 })
    expect(spreadColumns(1920)).toEqual({ railW: 248, notesW: 500 })
  })
})
