import { overseerrSeriesHref, plexItemHref } from "@/lib/ui/plex-links"

describe("plex-links", () => {
  it("matches the module's @example", () => {
    expect(plexItemHref("abc123", "5114")).toBe("https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F5114")
    expect(overseerrSeriesHref("https://requests.example.com/", 95396)).toBe("https://requests.example.com/tv/95396")
  })

  it("links nothing without a server id, or for a key that is not Plex's", () => {
    expect(plexItemHref(null, "5114")).toBeNull()
    expect(plexItemHref("abc123", "jellyfin-9f2c")).toBeNull()
    expect(plexItemHref("abc/../evil", "5114")).toBeNull()
  })

  it("links nothing to Overseerr without an http(s) base", () => {
    expect(overseerrSeriesHref(null, 1)).toBeNull()
    expect(overseerrSeriesHref("javascript:alert(1)", 1)).toBeNull()
  })
})
