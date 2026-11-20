import { sizeText, spokenSize } from "@/components/admin/cleanup/preview/sizes"

describe("sizeText", () => {
  it("formats decimal byte strings like formatBytes", () => {
    expect(sizeText(String(1.3 * 1024 ** 4))).toBe("1.3 TB")
    expect(sizeText(String(17.1 * 1024 ** 3))).toBe("17.1 GB")
  })

  it("reads zero as 0 GB and a missing size as Unknown", () => {
    expect(sizeText("0")).toBe("0 GB")
    expect(sizeText("not a number")).toBe("0 GB")
    expect(sizeText(null)).toBe("Unknown")
  })
})

describe("spokenSize", () => {
  it("speaks units as words, singular at 1", () => {
    expect(spokenSize("1.3 TB")).toBe("1.3 terabytes")
    expect(spokenSize("1 GB")).toBe("1 gigabyte")
    expect(spokenSize("197 movies, 22.4 GB")).toBe("197 movies, 22.4 gigabytes")
    expect(spokenSize("512 Bytes")).toBe("512 bytes")
    expect(spokenSize("3 KB and 4 MB and 2 PB")).toBe("3 kilobytes and 4 megabytes and 2 petabytes")
  })

  it("leaves other words alone", () => {
    expect(spokenSize("Unknown")).toBe("Unknown")
    expect(spokenSize("TB alone")).toBe("TB alone")
  })
})
