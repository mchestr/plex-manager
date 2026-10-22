/**
 * @jest-environment node
 */

import { checkUserServerAccess } from "@/lib/connections/plex"
import { waitForInvitedAccess } from "@/lib/connections/plex-access-wait"

jest.mock("@/lib/connections/plex", () => ({ checkUserServerAccess: jest.fn() }))

const mockCheck = jest.mocked(checkUserServerAccess)
const SERVER = { url: "https://plex.example.com:32400", token: "server-token", adminPlexUserId: null }

async function run() {
  const promise = waitForInvitedAccess(SERVER, "plex-member")
  await jest.runAllTimersAsync()
  return promise
}

describe("waitForInvitedAccess", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockCheck.mockReset()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("waits 3 s before the first check and stops at the first grant", async () => {
    mockCheck
      .mockResolvedValueOnce({ status: "denied" as const })
      .mockResolvedValueOnce({ status: "granted" as const })

    const promise = waitForInvitedAccess(SERVER, "plex-member")
    await jest.advanceTimersByTimeAsync(2999)
    expect(mockCheck).not.toHaveBeenCalled()
    await jest.runAllTimersAsync()

    await expect(promise).resolves.toEqual({ status: "granted" })
    expect(mockCheck).toHaveBeenCalledTimes(2)
    expect(mockCheck).toHaveBeenCalledWith(SERVER, "plex-member")
  })

  it("gives up after the first check and five retries", async () => {
    mockCheck.mockResolvedValue({ status: "denied" as const })

    await expect(run()).resolves.toEqual({ status: "denied" })
    expect(mockCheck).toHaveBeenCalledTimes(6)
  })

  it("retries an unknown check and returns the grant that follows", async () => {
    mockCheck
      .mockResolvedValueOnce({ status: "unknown", reason: "rate_limited", retryAfterSec: 5 })
      .mockResolvedValueOnce({ status: "granted" })

    await expect(run()).resolves.toEqual({ status: "granted" })
    expect(mockCheck).toHaveBeenCalledTimes(2)
  })

  it("never waits past three minutes", async () => {
    mockCheck.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60_000))
      return { status: "denied" as const }
    })

    await expect(run()).resolves.toEqual({ status: "unknown", reason: "plex_unavailable" })
    expect(mockCheck.mock.calls.length).toBeLessThan(6)
  })
})
