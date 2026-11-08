/** @jest-environment node */
/** The arr side of a read: views by source state, tag labels, import lists and the record root. */

import arrTags from "@/lib/cleanup/__tests__/fixtures/arr-tag.json"
import { arrRoot, type ArrRead, isImportListed, radarrView, sonarrView, tagLabelsOf } from "@/lib/cleanup/identity/arr"
import { arrTagSchema, type RadarrMovie, radarrMovieSchema } from "@/lib/cleanup/schema/upstream"

const record = radarrMovieSchema.parse({
  id: 1, title: "Invented", titleSlug: "invented", tmdbId: 1, path: "/data/movies/Invented", monitored: true, added: "2024-01-01T00:00:00Z", tags: [1, 2, 9],
})
const read: ArrRead<RadarrMovie> = {
  records: [record],
  rootFolders: [{ path: "/data/movies" }],
  tags: [...arrTagSchema.parse(arrTags), { id: 3, label: " Keep " }],
  importLists: [{ tags: [2] }],
  disk: [{ path: "/data", freeSpace: 1, totalSpace: 2 }],
}

describe("radarrView and sonarrView", () => {
  it("uses the read when the source is ok", () => {
    const view = radarrView("ok", read)
    expect(view).toMatchObject({ state: "ok", records: [record], roots: ["/data/movies"], disk: read.disk })
    expect(view.index.byId.get("tmdb")?.get("1")).toEqual([record])
  })

  it.each([["failed"], ["notConfigured"]] as const)("holds no data when the source is %s", (state) => {
    expect(radarrView(state, read)).toMatchObject({ state, records: [], roots: [], disk: [] })
  })

  it("reads an ok source without data as failed", () => {
    expect(radarrView("ok", null).state).toBe("failed")
    expect(sonarrView("ok", undefined).state).toBe("failed")
  })
})

describe("tags, import lists and roots", () => {
  const view = radarrView("ok", read)

  it("gives the labels of the tag ids in lower case, without unknown ids", () => {
    expect(tagLabelsOf(view, [1, 2, 3, 9, 1])).toEqual(["keep", "list-import"])
  })

  it("finds a tag of an import list", () => {
    expect(isImportListed(view, [1, 2])).toBe(true)
    expect(isImportListed(view, [1])).toBe(false)
  })

  it("takes the record's own root, else the root that holds its path, else nothing", () => {
    expect(arrRoot(view, "/data/movies/Invented", "/data/own")).toBe("/data/own")
    expect(arrRoot(view, "/data/movies/Invented", null)).toBe("/data/movies")
    expect(arrRoot(view, "/srv/Invented")).toBe("")
  })
})
