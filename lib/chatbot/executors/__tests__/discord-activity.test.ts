/**
 * What a member's Discord question about what is playing reaches the model
 * as: the real Plex and Tautulli executors, through executeToolCall and the
 * Discord scrub, with the services and the database mocked.
 *
 * A Jellyfin-only member (P11.12) gets {"unavailable":"jellyfin-member"}, and
 * the scrub must keep that marker whole so the Discord prompt's Jellyfin rule
 * can tell them why: scrubbed to {}, it read as nothing playing. A Plex member
 * gets their own streams, without anyone's identifiers or the admin's hints.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getPlexSessions } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { findTautulliUser, getTautulliActivity } from "@/lib/connections/tautulli"

import { executeToolCall } from ".."

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/connections/plex", () => ({ getPlexSessions: jest.fn() }))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/connections/tautulli", () => ({ findTautulliUser: jest.fn(), getTautulliActivity: jest.fn() }))
jest.mock("../sonarr", () => ({ executeSonarrTool: jest.fn() }))
jest.mock("../radarr", () => ({ executeRadarrTool: jest.fn() }))
jest.mock("../overseerr", () => ({ executeOverseerrTool: jest.fn() }))
jest.mock("../media-marking", () => ({ executeMediaMarkingTool: jest.fn() }))
jest.mock("../app-data", () => ({ executeAppDataTool: jest.fn() }))
jest.mock("../knowledge", () => ({ executeKnowledgeTool: jest.fn() }))
jest.mock("../../mcp/tools", () => ({ MCP_TOOL_PREFIX: "mcp_", executeMcpTool: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

const MEMBER_ZONE = { timeZone: "Europe/London", locale: "en-GB" }

const call = (name: string) => ({ id: "call_1", type: "function" as const, function: { name, arguments: "{}" } })

const ask = async (tool: string) => JSON.parse(await executeToolCall(call(tool), "user-1", "discord", false, MEMBER_ZONE))

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.tautulli.findFirst.mockResolvedValue({ id: "t-1", name: "Tautulli", url: "http://t", apiKey: "k", publicUrl: null } as never)
  jest.mocked(getActivePlexServerConfig).mockResolvedValue({
    name: "Home",
    url: "https://plex.example.com:32400",
    token: "owner-token",
    adminPlexUserId: "1000",
    machineIdentifier: null,
  })
  // Sam (Plex user 1001) watches Heat, and Alex (1002) watches Ronin
  jest.mocked(getPlexSessions).mockResolvedValue({
    success: true,
    data: {
      MediaContainer: {
        size: 2,
        Metadata: [
          {
            type: "movie",
            title: "Heat",
            year: 1995,
            User: { id: "1001", title: "sam_plex" },
            Player: { product: "Plex Web", platform: "Chrome", state: "playing", title: "Sam's laptop", address: "203.0.113.7" },
            Session: { id: "session-1", location: "wan", bandwidth: 8200 },
          },
          { type: "movie", title: "Ronin", User: { id: "1002", title: "alex_plex" } },
        ],
      },
    },
  })
  jest.mocked(getTautulliActivity).mockResolvedValue({
    success: true,
    data: {
      stream_count: "2",
      sessions: [
        { user_id: 1001, friendly_name: "Sam", title: "Heat", state: "playing", product: "Plex Web", player: "Sam's laptop", ip_address: "203.0.113.7" },
        { user_id: 1002, friendly_name: "Alex", title: "Ronin" },
      ],
    },
  })
})

describe("a Jellyfin-only member's streams in Discord (P11.12)", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: null, jellyfinUserId: "jf-1" } as never)
  })

  it.each(["get_plex_sessions", "get_tautulli_activity"])("%s tells the model the member is on Jellyfin", async (tool) => {
    expect(await ask(tool)).toEqual({ unavailable: "jellyfin-member" })
    expect(findTautulliUser).not.toHaveBeenCalled()
  })
})

describe("a Plex member's own streams in Discord", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "1001", jellyfinUserId: null } as never)
    jest.mocked(findTautulliUser).mockResolvedValue({ ok: true, user: { user_id: 1001, username: "sam_plex" } })
  })

  it("get_plex_sessions keeps what plays, without the admin's showing line", async () => {
    expect(await ask("get_plex_sessions")).toEqual({
      success: true,
      data: {
        totalSessions: 1,
        privacy: "Viewer identifiers removed for privacy compliance.",
        sessions: [
          {
            viewerLabel: "Viewer 1",
            mediaTitle: "Heat",
            mediaType: "movie",
            year: 1995,
            device: "Plex Web",
            platform: "Chrome",
            playbackState: "playing",
            location: "remote",
            bandwidthMbps: 8.2,
          },
        ],
      },
    })
  })

  it("get_tautulli_activity keeps what plays, without who is watching", async () => {
    expect(await ask("get_tautulli_activity")).toEqual({
      session_count: 1,
      sessions: [{ title: "Heat", state: "playing", product: "Plex Web" }],
      scope: "caller",
    })
  })
})
