import { unzipSync } from "fflate"

import { cardEntryName, openCardZip, zipFileName } from "@/lib/rewind/share/zip"

describe("the Save all ZIP (P8.4)", () => {
  it("holds every card under its folio and page name, byte for byte", async () => {
    const zip = await openCardZip()
    const cover = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    const number = new Uint8Array([137, 80, 78, 71, 9, 8, 7, 6])
    zip.add(cardEntryName(1, "Cover"), cover)
    zip.add(cardEntryName(2, "The number"), number)
    const files = unzipSync(await zip.finish())
    expect(Object.keys(files)).toEqual(["01-cover.png", "02-the-number.png"])
    expect(files["01-cover.png"]).toEqual(cover)
    expect(files["02-the-number.png"]).toEqual(number)
  })

  it("names entries and the archive", () => {
    expect(cardEntryName(2, "The number")).toBe("02-the-number.png")
    expect(cardEntryName(16, "Centrefold")).toBe("16-centrefold.png")
    expect(cardEntryName(3, "Top shows: 2026!")).toBe("03-top-shows-2026.png")
    expect(zipFileName(2026)).toBe("rewind-2026-cards.zip")
  })
})
