/**
 * @jest-environment node
 */

jest.mock("@/lib/connections/plex", () => ({ unshareUserFromPlexServer: jest.fn() }))
jest.mock("@/lib/members/offboard", () => ({ stopSyncAndClearPlexToken: jest.fn() }))
jest.mock("@/lib/affiliates/end-status", () => ({ endAffiliateStatus: jest.fn() }))
jest.mock("@/lib/session-revocation", () => ({ endUserSessions: jest.fn() }))

import { endAffiliateStatus } from "@/lib/affiliates/end-status"
import { unshareUserFromPlexServer } from "@/lib/connections/plex"
import { stopSyncAndClearPlexToken } from "@/lib/members/offboard"
import { UnshareCleanupError, unshareMember } from "@/lib/members/unshare"
import { endUserSessions } from "@/lib/session-revocation"

const member = { id: "member-1", plexUserId: "42" }
const server = { url: "https://plex.example.com:32400", token: "server-token", machineIdentifier: "machine-1" }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(unshareUserFromPlexServer).mockResolvedValue({ success: true, status: "removed" })
})

describe("unshareMember", () => {
  it("removes the share, then stops the sync, ends the affiliate status and ends the sessions, in that order", async () => {
    const order: string[] = []
    jest.mocked(stopSyncAndClearPlexToken).mockImplementation(async () => void order.push("sync"))
    jest.mocked(endAffiliateStatus).mockImplementation(async () => void order.push("affiliate"))
    jest.mocked(endUserSessions).mockImplementation(async () => void order.push("sessions"))

    await expect(unshareMember(member, server, "admin-1")).resolves.toEqual({ success: true, status: "removed" })

    expect(unshareUserFromPlexServer).toHaveBeenCalledWith(server, "42")
    expect(stopSyncAndClearPlexToken).toHaveBeenCalledWith("member-1")
    expect(endAffiliateStatus).toHaveBeenCalledWith("member-1", "UNSHARED", "admin-1")
    expect(endUserSessions).toHaveBeenCalledWith("member-1", "unshared", "admin-1")
    expect(order).toEqual(["sync", "affiliate", "sessions"])
  })

  it("offboards a member whose share was already gone", async () => {
    jest.mocked(unshareUserFromPlexServer).mockResolvedValue({ success: true, status: "already_removed" })

    await expect(unshareMember(member, server, "system")).resolves.toEqual({ success: true, status: "already_removed" })
    expect(endUserSessions).toHaveBeenCalledWith("member-1", "unshared", "system")
  })

  it.each(["PLEX_AUTH", "PLEX_UNAVAILABLE"] as const)("returns %s and changes nothing else", async (code) => {
    jest.mocked(unshareUserFromPlexServer).mockResolvedValue({ success: false, code })

    await expect(unshareMember(member, server, "admin-1")).resolves.toEqual({ success: false, code })
    expect(stopSyncAndClearPlexToken).not.toHaveBeenCalled()
    expect(endAffiliateStatus).not.toHaveBeenCalled()
    expect(endUserSessions).not.toHaveBeenCalled()
  })

  it("throws UnshareCleanupError with the share's status and the cause when a clean-up step fails", async () => {
    const cause = new Error("database down")
    jest.mocked(unshareUserFromPlexServer).mockResolvedValue({ success: true, status: "already_removed" })
    jest.mocked(endAffiliateStatus).mockRejectedValue(cause)

    const error = await unshareMember(member, server, "admin-1").catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(UnshareCleanupError)
    expect(error).toMatchObject({ name: "UnshareCleanupError", status: "already_removed", cause })
    expect(endUserSessions).not.toHaveBeenCalled()
  })

  it("lets a Plex call that throws propagate as it is", async () => {
    const thrown = new Error("unexpected")
    jest.mocked(unshareUserFromPlexServer).mockRejectedValue(thrown)

    await expect(unshareMember(member, server, "admin-1")).rejects.toBe(thrown)
    expect(stopSyncAndClearPlexToken).not.toHaveBeenCalled()
  })
})
