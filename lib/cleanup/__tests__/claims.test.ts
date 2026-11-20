/**
 * @jest-environment node
 */

const mockError = jest.fn()
const mockWarn = jest.fn()
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    error: (...args: unknown[]) => mockError(...args),
    warn: (...args: unknown[]) => mockWarn(...args),
  }),
}))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { claim, CLAIM_COLUMNS, holdClaim, isClaimHeld, release, tryClaim } from "@/lib/cleanup/claims"
import { CLAIM_RENEW_MS, CLAIM_STALE_MS } from "@/lib/cleanup/constants"

const now = new Date("2026-11-08T03:07:00.000Z")
const ID = { id: "cleanup" }
const at = (ms: number) => new Date(now.getTime() + ms)

/** Every claim write after the take: renewals, then the release. */
const claimWrites = () => prismaMock.cleanupSettings.updateMany.mock.calls.slice(1).map(([args]) => args)

/** Lets pending callbacks run: the real `setImmediate`, kept before any test fakes it. */
const realSetImmediate = setImmediate
const flush = () => new Promise((resolve) => realSetImmediate(resolve))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.cleanupSettings.updateMany.mockResolvedValue({ count: 1 })
})

describe("claim", () => {
  it.each(CLAIM_COLUMNS)("takes %s on the settings row when it is free or stale, and holds it", async (column) => {
    const held = await claim(column, now)

    expect(prismaMock.cleanupSettings.upsert).toHaveBeenCalledWith({ where: ID, create: ID, update: {} })
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenCalledWith({
      where: { ...ID, OR: [{ ...ID, [column]: null }, { ...ID, [column]: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } }] },
      data: { [column]: now },
    })
    expect(held).toMatchObject({ column })
    expect(held?.value()).toEqual(now)
    expect(held?.lost.aborted).toBe(false)
    await release(held!)
  })

  it("is busy while another holder has a claim that is not stale, and starts no renewal", async () => {
    jest.useFakeTimers({ now })
    try {
      prismaMock.cleanupSettings.updateMany.mockResolvedValueOnce({ count: 0 })

      await expect(claim("collectionsClaimAt", now)).resolves.toBeNull()
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it("takes the claim at the current time by default", async () => {
    const before = Date.now()
    const held = await claim("readClaimAt")
    expect(held!.value().getTime()).toBeGreaterThanOrEqual(before)
    await release(held!)
  })
})

describe("isClaimHeld", () => {
  it.each([
    ["no claim", null, false],
    ["a claim taken a minute ago", new Date(now.getTime() - 60_000), true],
    ["a claim renewed exactly 30 minutes ago", new Date(now.getTime() - CLAIM_STALE_MS), true],
    ["a claim left behind for over 30 minutes", new Date(now.getTime() - CLAIM_STALE_MS - 1), false],
  ])("%s", (_name, value, expected) => {
    expect(isClaimHeld(value, now)).toBe(expected)
  })

  it("reads the current time by default", () => {
    expect(isClaimHeld(new Date())).toBe(true)
  })
})

describe("holdClaim renewal", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("moves the claim forward every 5 minutes with a compare-and-set on its own value, and releases the newest", async () => {
    const held = await claim("runClaimAt", now)
    await jest.advanceTimersByTimeAsync(2 * CLAIM_RENEW_MS)

    expect(held!.value()).toEqual(at(2 * CLAIM_RENEW_MS))
    await expect(release(held!)).resolves.toBe(true)
    expect(claimWrites()).toEqual([
      { where: { ...ID, runClaimAt: now }, data: { runClaimAt: at(CLAIM_RENEW_MS) } },
      { where: { ...ID, runClaimAt: at(CLAIM_RENEW_MS) }, data: { runClaimAt: at(2 * CLAIM_RENEW_MS) } },
      { where: { ...ID, runClaimAt: at(2 * CLAIM_RENEW_MS) }, data: { runClaimAt: null } },
    ])
    expect(CLAIM_RENEW_MS).toBe(5 * 60_000)
  })

  it("aborts lost when a renewal finds another holder took the claim, renews no more, and leaves that claim alone", async () => {
    const held = holdClaim("collectionsClaimAt", now)
    prismaMock.cleanupSettings.updateMany.mockResolvedValueOnce({ count: 0 })

    await jest.advanceTimersByTimeAsync(3 * CLAIM_RENEW_MS)
    expect(held.lost.aborted).toBe(true)
    expect(mockWarn).toHaveBeenCalledWith("cleanup.claim_lost", { column: "collectionsClaimAt" })

    prismaMock.cleanupSettings.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(release(held)).resolves.toBe(false)
    // One renewal found the claim gone; none followed; the release names this holder's value
    expect(prismaMock.cleanupSettings.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { ...ID, collectionsClaimAt: now }, data: { collectionsClaimAt: at(CLAIM_RENEW_MS) } },
      { where: { ...ID, collectionsClaimAt: now }, data: { collectionsClaimAt: null } },
    ])
  })

  it("keeps the claim when a renewal fails, and tries again with the same value", async () => {
    const thrown = new Error("database down")
    const held = holdClaim("readClaimAt", now)
    prismaMock.cleanupSettings.updateMany.mockRejectedValueOnce(thrown)

    await jest.advanceTimersByTimeAsync(2 * CLAIM_RENEW_MS)
    await release(held)

    expect(held.lost.aborted).toBe(false)
    expect(mockError).toHaveBeenCalledWith("cleanup.claim_renew_failed", thrown, { column: "readClaimAt" })
    expect(prismaMock.cleanupSettings.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { ...ID, readClaimAt: now }, data: { readClaimAt: at(CLAIM_RENEW_MS) } },
      { where: { ...ID, readClaimAt: now }, data: { readClaimAt: at(2 * CLAIM_RENEW_MS) } },
      { where: { ...ID, readClaimAt: at(2 * CLAIM_RENEW_MS) }, data: { readClaimAt: null } },
    ])
  })

  it("waits for a renewal in flight before it releases, so the release names the newest value", async () => {
    let renewed: (value: { count: number }) => void = () => {}
    const held = holdClaim("runClaimAt", now)
    prismaMock.cleanupSettings.updateMany.mockImplementationOnce((() => new Promise((resolve) => (renewed = resolve))) as never)

    await jest.advanceTimersByTimeAsync(CLAIM_RENEW_MS)
    const releasing = release(held)
    for (let tick = 0; tick < 20; tick++) await flush()
    // The renewals stopped, and the release waits for the one in flight
    expect(jest.getTimerCount()).toBe(0)
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenCalledTimes(1)

    renewed({ count: 1 })
    await releasing
    expect(prismaMock.cleanupSettings.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { ...ID, runClaimAt: now }, data: { runClaimAt: at(CLAIM_RENEW_MS) } },
      { where: { ...ID, runClaimAt: at(CLAIM_RENEW_MS) }, data: { runClaimAt: null } },
    ])
  })

  it("stops renewing once released, and a second release changes nothing it does not own", async () => {
    const held = holdClaim("runClaimAt", now)
    await release(held)
    const writes = prismaMock.cleanupSettings.updateMany.mock.calls.length

    await jest.advanceTimersByTimeAsync(3 * CLAIM_RENEW_MS)
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenCalledTimes(writes)
    expect(jest.getTimerCount()).toBe(0)

    prismaMock.cleanupSettings.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(release(held)).resolves.toBe(false)
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenLastCalledWith({ where: { ...ID, runClaimAt: now }, data: { runClaimAt: null } })
  })

  it("lets one holder at a time take a column: a second claim while the first holds it is busy", async () => {
    const first = await claim("runClaimAt", now)
    prismaMock.cleanupSettings.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(claim("runClaimAt", at(1000))).resolves.toBeNull()
    await release(first!)
  })
})

describe("tryClaim", () => {
  it("skips the work while the claim is busy", async () => {
    prismaMock.cleanupSettings.updateMany.mockResolvedValueOnce({ count: 0 })
    const work = jest.fn()

    await expect(tryClaim("runClaimAt", work, { now })).resolves.toEqual({ claimed: false })
    expect(work).not.toHaveBeenCalled()
  })

  it("runs the work under the claim and releases it after", async () => {
    const work = jest.fn(async (held: { column: string; value(): Date }) => {
      expect(held.column).toBe("runClaimAt")
      expect(prismaMock.cleanupSettings.updateMany).toHaveBeenCalledTimes(1)
      return 3
    })

    await expect(tryClaim("runClaimAt", work, { now })).resolves.toEqual({ claimed: true, value: 3 })
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenLastCalledWith({ where: { ...ID, runClaimAt: now }, data: { runClaimAt: null } })
  })

  it("gives the claim up with the caller's release when it has one", async () => {
    const giveUp = jest.fn().mockResolvedValue(undefined)

    await tryClaim("runClaimAt", async () => "done", { now, release: giveUp })

    expect(giveUp).toHaveBeenCalledWith(expect.objectContaining({ column: "runClaimAt" }))
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenCalledTimes(1)
    await release(giveUp.mock.calls[0][0])
  })

  it("releases the claim when the work throws, then throws the work's error", async () => {
    const thrown = new Error("reconcile failed")

    await expect(tryClaim("runClaimAt", async () => Promise.reject(thrown), { now })).rejects.toBe(thrown)
    expect(prismaMock.cleanupSettings.updateMany).toHaveBeenLastCalledWith({ where: { ...ID, runClaimAt: now }, data: { runClaimAt: null } })
  })

  it("logs a release that fails after the work threw, and still throws the work's error", async () => {
    const thrown = new Error("reconcile failed")
    const releaseError = new Error("database down")
    const giveUp = jest.fn().mockRejectedValue(releaseError)

    await expect(tryClaim("runClaimAt", async () => Promise.reject(thrown), { now, release: giveUp })).rejects.toBe(thrown)
    expect(mockError).toHaveBeenCalledWith("cleanup.claim_release_failed", releaseError, { column: "runClaimAt" })
    await release(giveUp.mock.calls[0][0])
  })
})
