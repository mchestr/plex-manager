/** @jest-environment node */
/** Plex guid parsing (TS 7.4): the guid table, the conflict flag and the `?lang=` suffix. */

import { parsePlexGuids, stripLang } from "@/lib/cleanup/identity/guids"

const tag = (id: string) => ({ id })

describe("parsePlexGuids", () => {
  it.each([
    ["an IMDb tag", undefined, [tag("imdb://tt0111161")], "movie", { imdb: "tt0111161" }],
    ["a TMDB tag", undefined, [tag("tmdb://278")], "movie", { tmdb: 278 }],
    ["a TVDB tag", undefined, [tag("tvdb://121361")], "show", { tvdb: 121361 }],
    ["a plex primary guid", "plex://movie/5d7768aa96b655001fdc0101", [], "movie", { plex: "plex://movie/5d7768aa96b655001fdc0101" }],
    ["the legacy IMDb agent", "com.plexapp.agents.imdb://tt0111161?lang=en", [], "movie", { imdb: "tt0111161" }],
    ["the legacy TMDB agent", "com.plexapp.agents.themoviedb://278?lang=en", [], "movie", { tmdb: 278 }],
    ["the legacy TVDB agent on a show", "com.plexapp.agents.thetvdb://121361?lang=en", [], "show", { tvdb: 121361 }],
    ["the legacy TVDB agent on a movie", "com.plexapp.agents.thetvdb://121361?lang=en", [], "movie", {}],
    ["the none agent", "com.plexapp.agents.none://abc123", [], "movie", {}],
    ["a local guid", "local://12345", [], "movie", {}],
    ["no guid at all", undefined, [], "movie", {}],
  ] as const)("reads %s", (_name, primary, tags, kind, ids) => {
    expect(parsePlexGuids(primary, tags, kind)).toEqual({ ids, conflict: false })
  })

  it("reads every tag and the plex guid together", () => {
    const parsed = parsePlexGuids("plex://show/abc", [tag("imdb://tt9900201"), tag("tmdb://880201"), tag("tvdb://770201")], "show")
    expect(parsed).toEqual({ ids: { imdb: "tt9900201", tmdb: 880201, tvdb: 770201, plex: "plex://show/abc" }, conflict: false })
  })

  it("flags two different values for one id kind and keeps the first", () => {
    expect(parsePlexGuids(undefined, [tag("tmdb://1"), tag("tmdb://2")], "movie")).toEqual({ ids: { tmdb: 1 }, conflict: true })
    expect(parsePlexGuids("com.plexapp.agents.imdb://tt2?lang=en", [tag("imdb://tt1")], "movie")).toEqual({ ids: { imdb: "tt1" }, conflict: true })
  })

  it("takes the same value twice without a conflict", () => {
    expect(parsePlexGuids("com.plexapp.agents.themoviedb://278?lang=en", [tag("tmdb://278")], "movie")).toEqual({ ids: { tmdb: 278 }, conflict: false })
  })

  it.each([
    ["a TMDB id with letters", "tmdb://abc"],
    ["a TMDB id of 0", "tmdb://0"],
    ["an IMDb id without tt", "imdb://278"],
    ["an unknown scheme", "trakt://1"],
    ["no scheme", "278"],
    ["an empty scheme", "://278"],
    ["a TVDB id too large to be exact", "tvdb://99999999999999999999"],
  ])("leaves out %s", (_name, id) => {
    expect(parsePlexGuids(undefined, [tag(id)], "show")).toEqual({ ids: {}, conflict: false })
  })

  it("reads scheme and IMDb case loosely and drops the query and the path", () => {
    expect(parsePlexGuids(undefined, [tag("IMDB://TT0111161"), tag("tvdb://121361/1/2?x=1")], "show")).toEqual({
      ids: { imdb: "tt0111161", tvdb: 121361 }, conflict: false,
    })
  })
})

describe("stripLang", () => {
  it.each([
    ["com.plexapp.agents.imdb://tt0111161?lang=en", "com.plexapp.agents.imdb://tt0111161"],
    ["com.plexapp.agents.thetvdb://770202/1/1?lang=de", "com.plexapp.agents.thetvdb://770202/1/1"],
    ["plex://movie/abc", "plex://movie/abc"],
  ])("strips %s", (guid, expected) => {
    expect(stripLang(guid)).toBe(expected)
  })
})
