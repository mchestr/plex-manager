import { arrItemHref, overseerrSeriesHref, plexItemHref } from "@/lib/ui/plex-links"

describe("plex-links", () => {
  it("matches the module's @example", () => {
    expect(plexItemHref("abc123", "5114")).toBe("https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F5114")
    expect(overseerrSeriesHref("https://requests.example.com/", 95396)).toBe("https://requests.example.com/tv/95396")
    expect(arrItemHref("https://sonarr.example.com/", "sonarr", "the-long-night")).toBe("https://sonarr.example.com/series/the-long-night")
  })

  it("links nothing without a server id, or for a key that is not Plex's", () => {
    expect(plexItemHref(null, "5114")).toBeNull()
    expect(plexItemHref("abc123", "guid-9f2c")).toBeNull()
    expect(plexItemHref("abc/../evil", "5114")).toBeNull()
  })

  it("links nothing to Overseerr without an http(s) base", () => {
    expect(overseerrSeriesHref(null, 1)).toBeNull()
    expect(overseerrSeriesHref("javascript:alert(1)", 1)).toBeNull()
  })
})

describe("arrItemHref", () => {
  it("links a film to Radarr's movie page and a show to Sonarr's series page, by slug", () => {
    expect(arrItemHref("https://radarr.example.com", "radarr", "a-quiet-harbour-2019")).toBe(
      "https://radarr.example.com/movie/a-quiet-harbour-2019"
    )
    expect(arrItemHref("https://sonarr.example.com", "sonarr", "the-long-night")).toBe("https://sonarr.example.com/series/the-long-night")
  })

  it("keeps a base path and drops its trailing slashes, query and fragment", () => {
    expect(arrItemHref("https://media.example.com/radarr//", "radarr", "film-one")).toBe("https://media.example.com/radarr/movie/film-one")
    expect(arrItemHref("https://media.example.com/sonarr/?tab=1#top", "sonarr", "show-two")).toBe(
      "https://media.example.com/sonarr/series/show-two"
    )
  })

  it("returns null without a public URL, so the button hides", () => {
    expect(arrItemHref(null, "radarr", "film-one")).toBeNull()
    expect(arrItemHref("", "sonarr", "show-two")).toBeNull()
  })

  it.each([
    ["a script URL", "javascript:alert(1)"],
    ["a data URL", "data:text/html,hi"],
    ["a URL with credentials", "https://admin:secret@radarr.example.com"],
  ])("returns null for %s", (_label, base) => {
    expect(arrItemHref(base, "radarr", "film-one")).toBeNull()
  })

  it("builds the path from the title slug it is given and nothing else", () => {
    // A numbered title's slug is all digits; the caller passes `titleSlug`, never the database `id`
    expect(arrItemHref("https://sonarr.example.com", "sonarr", "4417")).toBe("https://sonarr.example.com/series/4417")
    expect(arrItemHref("https://radarr.example.com", "radarr", "Film_One")).toBe("https://radarr.example.com/movie/Film_One")
  })

  it.each([
    ["an empty slug", ""],
    ["a path", "../../system/status"],
    ["a slash", "film/one"],
    ["a query", "film?x=1"],
    ["a space", "film one"],
    ["a leading hyphen", "-film"],
  ])("returns null for %s instead of a slug", (_label, slug) => {
    expect(arrItemHref("https://radarr.example.com", "radarr", slug)).toBeNull()
  })
})
