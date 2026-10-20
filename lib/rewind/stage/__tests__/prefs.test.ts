import { DEFAULT_STAGE_PREFS, PREFS_KEY, parsePrefs, readPrefs, writePrefs } from "../prefs"

afterEach(() => {
  jest.restoreAllMocks()
  window.localStorage.clear()
})

describe("stage prefs", () => {
  it("uses the defaults when nothing is stored", () => {
    expect(readPrefs()).toEqual({ autoplay: true, slowerPacing: false, shortcuts: true, smallScreenChoice: null })
  })

  it("uses the defaults when reading storage throws", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError")
    })
    expect(readPrefs()).toBe(DEFAULT_STAGE_PREFS)
  })

  it("drops the write and keeps the defaults when writing throws", () => {
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    expect(writePrefs({ shortcuts: false })).toBe(false)
    expect(readPrefs()).toBe(DEFAULT_STAGE_PREFS)
  })

  it("uses the defaults for garbage JSON and a bad field's default for a bad field", () => {
    window.localStorage.setItem(PREFS_KEY, "{not json")
    expect(readPrefs()).toBe(DEFAULT_STAGE_PREFS)
    expect(parsePrefs('"a string"')).toBe(DEFAULT_STAGE_PREFS)
    expect(parsePrefs('{"autoplay":"yes","shortcuts":false}')).toEqual({ ...DEFAULT_STAGE_PREFS, shortcuts: false })
  })

  it("round-trips a valid value", () => {
    expect(writePrefs({ autoplay: false, slowerPacing: true, smallScreenChoice: "article" })).toBe(true)
    expect(readPrefs()).toEqual({ autoplay: false, slowerPacing: true, shortcuts: true, smallScreenChoice: "article" })
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "")).toEqual(readPrefs())
  })
})
