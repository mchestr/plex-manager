import { activitySchema, activityValues, librariesSchema, libraryValues, serverStatus } from "../stats"

describe("serverStatus", () => {
  it.each([
    [true, true, "online"],
    [true, false, "degraded"],
    [false, true, "degraded"],
    [false, false, "offline"],
  ] as const)("activity %s, libraries %s is %s", (activity, libraries, status) => {
    expect(serverStatus(activity, libraries)).toBe(status)
  })
})

describe("activityValues", () => {
  it("reads counts that arrive as strings and converts kbps to Mbps", () => {
    const activity = activitySchema.parse({ stream_count: "3", stream_count_transcode: 1, total_bandwidth: 12_345 })
    expect(activityValues(activity)).toEqual({ streams: "3", transcodes: "1", bandwidth: "12.3" })
  })

  it("counts a missing field as zero", () => {
    expect(activityValues(activitySchema.parse({}))).toEqual({ streams: "0", transcodes: "0", bandwidth: "0.0" })
  })
})

describe("libraryValues", () => {
  it("sums movies, shows and episodes across libraries", () => {
    const libraries = librariesSchema.parse([
      { section_type: "movie", count: "100" },
      { section_type: "movie", count: 20 },
      { section_type: "show", count: "30", child_count: "900" },
      { section_type: "show", count: 5, child_count: 100 },
      { section_type: "artist", count: 99, child_count: 99 },
    ])
    expect(libraryValues(libraries)).toEqual({ movies: "120", shows: "35", episodes: "1000" })
  })

  it("is zero without libraries", () => {
    expect(libraryValues([])).toEqual({ movies: "0", shows: "0", episodes: "0" })
  })
})
