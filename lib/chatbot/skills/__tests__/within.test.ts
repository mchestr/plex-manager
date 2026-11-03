/**
 * @jest-environment node
 */

import { mockReset } from "jest-mock-extended"

import { buildSkillSource } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"

import { loadSkillCatalog, type SkillCatalog } from "../catalog"
import { SKILL_CATALOG_TIMEOUT_MS, loadSkillCatalogWithin } from "../within"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("../catalog", () => ({ loadSkillCatalog: jest.fn() }))
const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args) }),
}))

const CATALOG: SkillCatalog = { skills: [], problems: [], sources: [{ id: "src", name: "Ops", sha: "c".repeat(40), pinned: false }] }
/** A load stuck on a slow GitHub. */
const stuck = () => new Promise<SkillCatalog>(() => undefined)
/**
 * The active sources the key is built from. Each test uses its own id, so a
 * failure one test leaves behind never matches another's key.
 */
const activeSources = (id: string, updatedAt = new Date(1)) => prismaMock.skillSource.findMany.mockResolvedValue([buildSkillSource({ id, updatedAt })])

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(loadSkillCatalog).mockReset()
  mockWarn.mockReset()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

describe("loadSkillCatalogWithin", () => {
  it("loadSkillCatalogWithin remembers a failure for 30 seconds", async () => {
    activeSources("src-memory")
    jest.mocked(loadSkillCatalog).mockImplementation(stuck)
    const first = loadSkillCatalogWithin()
    await jest.advanceTimersByTimeAsync(SKILL_CATALOG_TIMEOUT_MS)
    expect(await first).toBeNull()

    // Within 30 seconds: null at once, with no new load
    jest.mocked(loadSkillCatalog).mockResolvedValue(CATALOG)
    await jest.advanceTimersByTimeAsync(29_000)
    expect(await loadSkillCatalogWithin()).toBeNull()
    expect(loadSkillCatalog).toHaveBeenCalledTimes(1)

    // 30 seconds on: loads again
    await jest.advanceTimersByTimeAsync(1_000)
    expect(await loadSkillCatalogWithin()).toBe(CATALOG)
    expect(loadSkillCatalog).toHaveBeenCalledTimes(2)

    // A source saved within 30 seconds of a failure: loads again at once
    jest.mocked(loadSkillCatalog).mockRejectedValueOnce(new Error("GitHub down"))
    expect(await loadSkillCatalogWithin()).toBeNull()
    expect(await loadSkillCatalogWithin()).toBeNull()
    expect(loadSkillCatalog).toHaveBeenCalledTimes(3)
    activeSources("src-memory", new Date(2))
    expect(await loadSkillCatalogWithin()).toBe(CATALOG)
    expect(loadSkillCatalog).toHaveBeenCalledTimes(4)
  })

  it("loadSkillCatalogWithin gives up after five seconds", async () => {
    expect(SKILL_CATALOG_TIMEOUT_MS).toBe(5_000)
    activeSources("src-slow")
    let signal: AbortSignal | undefined
    jest.mocked(loadSkillCatalog).mockImplementation((given) => {
      signal = given
      return stuck()
    })

    const slow = loadSkillCatalogWithin()
    let settled = false
    void slow.then(() => {
      settled = true
    })
    await jest.advanceTimersByTimeAsync(4_999)
    expect(settled).toBe(false)
    await jest.advanceTimersByTimeAsync(1)
    expect(await slow).toBeNull()
    expect(signal?.aborted).toBe(true)
    expect(jest.getTimerCount()).toBe(0)
    expect(mockWarn).toHaveBeenCalledWith("Skill catalogue unavailable", { reason: "timeout" })

    activeSources("src-broken")
    jest.mocked(loadSkillCatalog).mockRejectedValue(new Error("reader bug"))
    expect(await loadSkillCatalogWithin()).toBeNull()
    expect(mockWarn).toHaveBeenLastCalledWith("Skill catalogue unavailable", { reason: "error", error: "Error: reader bug" })
    expect(jest.getTimerCount()).toBe(0)

    activeSources("src-fine")
    jest.mocked(loadSkillCatalog).mockResolvedValue(CATALOG)
    expect(await loadSkillCatalogWithin()).toBe(CATALOG)
    expect(jest.getTimerCount()).toBe(0)
  })

  it("resolves null when the sources cannot be read", async () => {
    prismaMock.skillSource.findMany.mockRejectedValue(new Error("database down"))

    expect(await loadSkillCatalogWithin()).toBeNull()
    expect(loadSkillCatalog).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenCalledWith("Skill catalogue unavailable", { reason: "error", error: "Error: database down" })
  })
})
