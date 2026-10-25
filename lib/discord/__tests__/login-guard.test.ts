/**
 * @jest-environment node
 */

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  DAILY_LOGIN_CAP,
  LoginGuard,
  backoffMs,
  isFatalLoginError,
} from "@/lib/discord/login-guard"

function build(initialCount = 0) {
  let clock = 1_000_000
  let count = initialCount
  const ledger = {
    count: jest.fn(async () => count),
    record: jest.fn(async () => {
      count += 1
    }),
  }
  const guard = new LoginGuard(ledger, () => clock, () => 0)
  return { guard, ledger, now: () => clock, advance: (ms: number) => (clock += ms) }
}

describe("backoffMs", () => {
  it("starts at 30 s, doubles and stops at 30 min", () => {
    const steps = [1, 2, 3, 4, 5, 6, 7, 8, 20].map((failures) => backoffMs(failures, () => 0))
    expect(steps).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000, 1_800_000])
    expect(backoffMs(1, () => 0.999)).toBeLessThanOrEqual(BACKOFF_BASE_MS * 1.25)
    expect(backoffMs(30, () => 0.999)).toBe(BACKOFF_MAX_MS)
  })
})

describe("isFatalLoginError", () => {
  it.each([
    [{ code: "TokenInvalid" }, true],
    [{ code: "DisallowedIntents" }, true],
    [{ code: 4004 }, true],
    [{ code: 4014 }, true],
    [{ status: 401 }, true],
    [{ code: "ETIMEDOUT" }, false],
    [{ status: 429 }, false],
    [new Error("socket hang up"), false],
    ["boom", false],
  ])("%j: %s", (error, expected) => {
    expect(isFatalLoginError(error)).toBe(expected)
  })
})

describe("LoginGuard", () => {
  it("spaces attempts further apart after each failure and resets after a stable READY", async () => {
    const { guard, now, advance } = build()
    const gaps: number[] = []

    for (let i = 0; i < 4; i++) {
      await expect(guard.check("t1")).resolves.toEqual({ allowed: true })
      const verdict = guard.recordFailure(new Error("timeout"), "t1")
      if (verdict.allowed || verdict.retryAt === null) throw new Error("expected a backoff")
      gaps.push(verdict.retryAt - now())
      await expect(guard.check("t1")).resolves.toMatchObject({ allowed: false, reason: "backoff" })
      advance(gaps[i])
    }
    expect(gaps).toEqual([30_000, 60_000, 120_000, 240_000])

    guard.recordReady()
    await expect(guard.check("t1")).resolves.toEqual({ allowed: true })
    expect(guard.recordFailure(new Error("timeout"), "t1")).toMatchObject({ retryAt: now() + BACKOFF_BASE_MS })
  })

  it("blocks a fatal error until the token changes", async () => {
    const { guard } = build()
    expect(guard.recordFailure({ code: "TokenInvalid" }, "old")).toMatchObject({ allowed: false, reason: "fatal" })

    await expect(guard.check("old")).resolves.toMatchObject({ allowed: false, reason: "fatal" })
    await expect(guard.check("new")).resolves.toEqual({ allowed: true })
  })

  it("blocks above the daily cap and counts attempts through the ledger", async () => {
    const { guard, ledger } = build(DAILY_LOGIN_CAP - 1)

    await expect(guard.check("t")).resolves.toEqual({ allowed: true })
    await guard.recordAttempt()
    expect(ledger.record).toHaveBeenCalledTimes(1)
    await expect(guard.check("t")).resolves.toMatchObject({ allowed: false, reason: "daily_cap" })
  })
})
