/**
 * @jest-environment node
 */

/**
 * The Plex executor's Discord scoping of `get_plex_sessions` (GAP-08), on the
 * recorded PMS sessions in lib/connections/__tests__/fixtures/pms/: the
 * server owner's own stream is PMS user 1, so it matches the owner and no one
 * else.
 */

import { readFileSync } from "fs"
import path from "path"

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getPlexRecentlyAdded, getPlexSessions } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"

import { executePlexTool } from "../plex"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/plex", () => ({
  getPlexLibrarySections: jest.fn(),
  getPlexOnDeck: jest.fn(),
  getPlexRecentlyAdded: jest.fn(),
  getPlexServerIdentity: jest.fn(),
  getPlexSessions: jest.fn(),
}))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))

const SESSIONS = JSON.parse(
  readFileSync(path.join(__dirname, "../../../../lib/connections/__tests__/fixtures/pms/sessions-owner.json"), "utf8")
)
const CONFIG = {
  name: "Home",
  url: "https://plex.example.com:32400",
  token: "owner-token",
  adminPlexUserId: "1000",
  machineIdentifier: "this-server-machine-id",
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(getActivePlexServerConfig).mockResolvedValue(CONFIG)
  jest.mocked(getPlexSessions).mockResolvedValue({ success: true, data: SESSIONS })
})

async function sessionTitlesFor(plexUserId: string): Promise<string[]> {
  prismaMock.user.findUnique.mockResolvedValue({ plexUserId, jellyfinUserId: null } as never)
  const result = JSON.parse(await executePlexTool("get_plex_sessions", {}, "user-1", "discord")) as {
    data: { sessions: { mediaTitle?: string }[] }
  }
  return result.data.sessions.map((session) => session.mediaTitle ?? "")
}

describe("executePlexTool get_plex_sessions in Discord", () => {
  it("gives the owner their own stream, reported as PMS user 1", async () => {
    await expect(sessionTitlesFor("1000")).resolves.toEqual(["Arrival"])
  })

  it("gives a member only their own stream, never the owner's", async () => {
    const titles = await sessionTitlesFor("1001")

    expect(titles).toHaveLength(1)
    expect(titles[0]).toContain("Severance")
  })
})

describe("executePlexTool get_plex_sessions for a Jellyfin-only member (P11.12)", () => {
  it("says the member is on Jellyfin instead of reporting no sessions", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: null, jellyfinUserId: "jf-1" } as never)

    const result = JSON.parse(await executePlexTool("get_plex_sessions", {}, "user-1", "discord"))

    expect(result).toEqual({ unavailable: "jellyfin-member" })
  })

  it("still scopes a member with both services to their Plex streams", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "1001", jellyfinUserId: "jf-1" } as never)

    const result = JSON.parse(await executePlexTool("get_plex_sessions", {}, "user-1", "discord")) as {
      data: { sessions: unknown[] }
    }

    expect(result.data.sessions).toHaveLength(1)
  })
})

describe("executePlexTool get_plex_recently_added", () => {
  it("passes the requested count through", async () => {
    jest.mocked(getPlexRecentlyAdded).mockResolvedValue({ success: true, data: {} })

    await executePlexTool("get_plex_recently_added", { limit: 5 })

    expect(getPlexRecentlyAdded).toHaveBeenCalledWith(CONFIG, 5)
  })
})
