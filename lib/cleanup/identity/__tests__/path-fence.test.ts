/** @jest-environment node */
/** The path fence (TS 7.4, E18): `isInside`, `isStrictlyInside`, root folders, file fences and the managed copy. */

import { bySection, fenceFiles, isInside, isStrictlyInside, normalisePath, pickManagedCopy, rootOf } from "@/lib/cleanup/identity/path-fence"

describe("isInside", () => {
  it.each([
    ["/data/movies/a.mkv", "/data/movies", true],
    ["/data/movies", "/data/movies", true],
    ["/data/movies/", "/data/movies", true],
    ["/data/movies/a.mkv", "/data/movies/", true],
    ["/data//movies///a.mkv", "/data/movies", true],
    ["/data/movies4k/a.mkv", "/data/movies", false],
    ["/data/Movies/a.mkv", "/data/movies", false],
    ["/data/movies/../tv/a.mkv", "/data/movies", false],
    ["/data/movies/./a.mkv", "/data/movies", false],
    ["/data/movies/a.mkv", "/data/../data/movies", false],
    ["data/movies/a.mkv", "data/movies", false],
    ["C:\\movies\\a.mkv", "C:\\movies", false],
    ["", "/data", false],
    ["/data/movies/a.mkv", "/", true],
    ["/data", "/data/movies", false],
  ])("says %s inside %s is %s", (child, parent, expected) => {
    expect(isInside(child, parent)).toBe(expected)
  })
})

describe("isStrictlyInside", () => {
  it.each([
    ["/data/movies/A", "/data/movies", true],
    ["/data/movies", "/data/movies", false],
    ["/data/movies/", "/data/movies", false],
    ["/data/movies4k/A", "/data/movies", false],
  ])("says %s strictly inside %s is %s", (child, parent, expected) => {
    expect(isStrictlyInside(child, parent)).toBe(expected)
  })
})

describe("normalisePath", () => {
  it("collapses slashes and strips one trailing slash, and keeps the root", () => {
    expect(normalisePath("//data//movies/")).toBe("/data/movies")
    expect(normalisePath("/")).toBe("/")
    expect(normalisePath("relative")).toBeNull()
  })
})

describe("rootOf", () => {
  it("gives the longest root that strictly holds the path", () => {
    expect(rootOf("/data/media/movies/A", ["/data", "/data/media/movies", "/other"])).toBe("/data/media/movies")
  })

  it("gives null for a path equal to its root or outside every root", () => {
    expect(rootOf("/data/movies", ["/data/movies"])).toBeNull()
    expect(rootOf("/srv/movies/A", ["/data/movies"])).toBeNull()
  })
})

describe("fenceFiles", () => {
  it("passes when every file is inside the arr path", () => {
    expect(fenceFiles(["/data/movies/A/a.mkv", "/data/movies/A/a.srt"], "/data/movies/A")).toBeNull()
  })

  it("gives outsideArrPath for one file outside", () => {
    expect(fenceFiles(["/data/movies/A/a.mkv", "/data/movies4k/A/a.mkv"], "/data/movies/A")).toBe("outsideArrPath")
  })

  it("gives noPlexFile for a copy with no file", () => {
    expect(fenceFiles([], "/data/movies/A")).toBe("noPlexFile")
  })
})

describe("pickManagedCopy", () => {
  const copy = (sectionId: string, ratingKey: string, inside: boolean) => ({ sectionId, ratingKey, inside })
  const fence = (c: { inside: boolean }) => (c.inside ? null : "outsideArrPath" as const)

  it("takes the copy that passes", () => {
    const managed = copy("3", "30", true)
    expect(pickManagedCopy([copy("1", "10", false), managed], fence)).toEqual({ chosen: managed, managed: true, cause: null })
  })

  it("takes the lowest section id of two copies that pass, by number", () => {
    const nine = copy("9", "90", true)
    expect(pickManagedCopy([copy("10", "100", true), nine], fence).chosen).toBe(nine)
  })

  it("falls back to the first copy by section id with its cause", () => {
    const first = copy("2", "20", false)
    expect(pickManagedCopy([copy("4", "40", false), first], fence)).toEqual({ chosen: first, managed: false, cause: "outsideArrPath" })
  })

  it("sorts by rating key inside one section", () => {
    expect([copy("1", "12", true), copy("1", "3", true)].sort(bySection).map((c) => c.ratingKey)).toEqual(["3", "12"])
  })
})
