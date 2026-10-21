/**
 * @jest-environment node
 */
import { isLowEnd, readLowEndSignals, saveDataRequested } from "@/lib/rewind/stage/low-end"

describe("isLowEnd", () => {
  it("is true at 4 cores or fewer", () => {
    expect(isLowEnd({ hardwareConcurrency: 4 })).toBe(true)
    expect(isLowEnd({ hardwareConcurrency: 2 })).toBe(true)
    expect(isLowEnd({ hardwareConcurrency: 8 })).toBe(false)
  })

  it("is true at 2 GB or less", () => {
    expect(isLowEnd({ deviceMemory: 2 })).toBe(true)
    expect(isLowEnd({ deviceMemory: 0.5 })).toBe(true)
    expect(isLowEnd({ deviceMemory: 4 })).toBe(false)
  })

  it("is true with Save-Data on its own", () => {
    expect(isLowEnd({ hardwareConcurrency: 8, deviceMemory: 8, saveData: true })).toBe(true)
    expect(isLowEnd({ hardwareConcurrency: 8, deviceMemory: 8, saveData: false })).toBe(false)
  })

  it("treats missing or zero signals as not low-end", () => {
    expect(isLowEnd({})).toBe(false)
    expect(isLowEnd({ hardwareConcurrency: 0, deviceMemory: 0 })).toBe(false)
  })
})

describe("readLowEndSignals", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  const stubNavigator = (value: unknown) => Object.defineProperty(globalThis, "navigator", { value, configurable: true })
  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original)
  })

  it("reads the cores, memory and Save-Data from navigator", () => {
    stubNavigator({ hardwareConcurrency: 2, deviceMemory: 1, connection: { saveData: true } })
    expect(readLowEndSignals()).toEqual({ hardwareConcurrency: 2, deviceMemory: 1, saveData: true })
  })

  it("reads nothing without a navigator", () => {
    stubNavigator(undefined)
    expect(readLowEndSignals()).toEqual({})
  })
})

describe("saveDataRequested", () => {
  it("is true only for the header's `on`", () => {
    expect(saveDataRequested("on")).toBe(true)
    expect(saveDataRequested(" On ")).toBe(true)
    expect(saveDataRequested("off")).toBe(false)
    expect(saveDataRequested(null)).toBe(false)
  })
})
