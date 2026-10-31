/**
 * @jest-environment node
 */

jest.mock("@/lib/connections/plex", () => ({ getPlexUsers: jest.fn() }))
jest.mock("@/lib/connections/plex-machine-id", () => ({ withMachineIdentifier: jest.fn() }))

import { buildPlexServer } from "@/__tests__/helpers/factories"
import { getPlexUsers } from "@/lib/connections/plex"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import type { PlexTvUser } from "@/lib/connections/plex-tv-users"
import { hasShare, readPlexShares } from "@/lib/inactivity/shares"

const MACHINE = "machine-1"
const server = buildPlexServer({ machineIdentifier: MACHINE, adminPlexUserId: "1" })

function plexUser(id: string, share: { machineIdentifier?: string; pending?: boolean } = {}): PlexTvUser {
  return {
    id,
    username: `user${id}`,
    title: `user${id}`,
    home: false,
    restricted: false,
    servers: [{ machineIdentifier: share.machineIdentifier ?? MACHINE, shareId: `share-${id}`, owned: false, pending: share.pending ?? false }],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(withMachineIdentifier).mockImplementation(async (row) => row)
})

describe("readPlexShares", () => {
  it("keeps the accounts with an accepted share of this server, and the server to unshare from", async () => {
    jest.mocked(getPlexUsers).mockResolvedValue({
      success: true,
      data: [plexUser("10"), plexUser("11", { pending: true }), plexUser("12", { machineIdentifier: "another-server" })],
    })

    const shares = await readPlexShares(server)

    expect(shares).toEqual({
      ok: true,
      ids: new Set(["10"]),
      server: { url: server.url, token: server.token, machineIdentifier: MACHINE, adminPlexUserId: "1" },
    })
    expect(getPlexUsers).toHaveBeenCalledTimes(1)
    expect(getPlexUsers).toHaveBeenCalledWith(server.token)
  })

  it("reads the machine identifier when the server has none stored", async () => {
    jest.mocked(withMachineIdentifier).mockImplementation(async (row) => ({ ...row, machineIdentifier: "filled" }))
    jest.mocked(getPlexUsers).mockResolvedValue({ success: true, data: [plexUser("10", { machineIdentifier: "filled" })] })

    await expect(readPlexShares(buildPlexServer())).resolves.toMatchObject({ ok: true, ids: new Set(["10"]) })
  })

  it("names no_plex_server without an active server, and reads nothing", async () => {
    await expect(readPlexShares(null)).resolves.toEqual({ ok: false, block: "no_plex_server" })
    expect(getPlexUsers).not.toHaveBeenCalled()
  })

  it("names plex_unavailable when the machine identifier cannot be read", async () => {
    jest.mocked(withMachineIdentifier).mockImplementation(async (row) => ({ ...row, machineIdentifier: null }))

    await expect(readPlexShares(buildPlexServer())).resolves.toEqual({ ok: false, block: "plex_unavailable" })
    expect(getPlexUsers).not.toHaveBeenCalled()
  })

  it.each([
    ["plex_auth", { success: false, status: 401, error: "Unauthorized" }],
    ["plex_unavailable", { success: false, status: 503, error: "Unavailable" }],
    ["plex_unavailable", { success: false, error: "timeout" }],
    ["plex_unavailable", { success: true }],
  ])("names %s when plex.tv answers %p", async (block, answer) => {
    jest.mocked(getPlexUsers).mockResolvedValue(answer)

    await expect(readPlexShares(server)).resolves.toEqual({ ok: false, block })
  })
})

describe("hasShare", () => {
  const ids = new Set(["10"])

  it.each([
    ["10", true],
    [" 10 ", true],
    ["11", false],
    ["", false],
    ["   ", false],
    [null, false],
  ])("is %p: %p", (plexUserId, expected) => {
    expect(hasShare(ids, plexUserId)).toBe(expected)
  })
})
