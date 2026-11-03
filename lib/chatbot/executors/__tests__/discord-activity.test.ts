/**
 * What a member's Discord question about what is playing reaches the model
 * as: the real Plex and Tautulli executors, through executeToolCall and the
 * Discord scrub, with the services and the database mocked.
 *
 * A Jellyfin-only member (P11.12) gets {"unavailable":"jellyfin-member"}, and
 * the scrub must keep that marker whole so the Discord prompt's Jellyfin rule
 * can tell them why: scrubbed to {}, it read as nothing playing. A Plex member
 * gets their own streams, without anyone's identifiers or the admin's hints.
 *
 * When Tautulli cannot read Plex's sessions it still answers success, with no
 * sessions at all. Every surface reports that as a failure, not as nobody
 * watching: Discord, the admin web, a Support caller and MCP.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getPlexSessions } from "@/lib/connections/plex"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { findTautulliUser, getTautulliActivity } from "@/lib/connections/tautulli"
import { permissionsFor } from "@/lib/permissions"

import { executeToolCall } from ".."
import { ROLE_TOOL_UNAVAILABLE } from "../role-scrub"
import { isToolError } from "../tool-output"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ getPlexSessions: jest.fn() }))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))
jest.mock("@/lib/connections/tautulli", () => ({ findTautulliUser: jest.fn(), getTautulliActivity: jest.fn() }))
jest.mock("../sonarr", () => ({ executeSonarrTool: jest.fn() }))
jest.mock("../radarr", () => ({ executeRadarrTool: jest.fn() }))
jest.mock("../overseerr", () => ({ executeOverseerrTool: jest.fn() }))
jest.mock("../media-marking", () => ({ executeMediaMarkingTool: jest.fn() }))
jest.mock("../app-data", () => ({ executeAppDataTool: jest.fn() }))
jest.mock("../knowledge", () => ({ executeKnowledgeTool: jest.fn() }))
jest.mock("../skills", () => ({ executeSkillTool: jest.fn() }))
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

describe("get_tautulli_activity when Tautulli cannot read Plex's sessions", () => {
  const ADMIN = permissionsFor({ isAdmin: true })
  const SUPPORT = permissionsFor({ isAdmin: false, role: "support" })
  const activity = call("get_tautulli_activity")

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ plexUserId: "1001", jellyfinUserId: null } as never)
    jest.mocked(findTautulliUser).mockResolvedValue({ ok: true, user: { user_id: 1001, username: "sam_plex" } })
    // Tautulli's get_activity logs "Unable to retrieve data for get_activity." and returns {}
    jest.mocked(getTautulliActivity).mockResolvedValue({ success: true, data: {} })
  })

  it("is the fixed unavailable line in Discord, not 'nothing playing'", async () => {
    expect(await executeToolCall(activity, "user-1", "discord", false, MEMBER_ZONE)).toBe("Error: that tool isn't available right now.")
  })

  it("is an error on the admin web, so the assistant turns to get_plex_sessions, and in MCP, which marks it isError", async () => {
    for (const context of ["default", undefined]) {
      const output = await executeToolCall(activity, "admin-1", context, true, MEMBER_ZONE, ADMIN)

      expect(JSON.parse(output)).toEqual({ error: "Tautulli could not read the current sessions from Plex" })
      expect(isToolError(output)).toBe(true)
    }
  })

  it("is the fixed unavailable line for a Support caller", async () => {
    expect(await executeToolCall(activity, "support-1", "default", false, MEMBER_ZONE, SUPPORT)).toBe(ROLE_TOOL_UNAVAILABLE)
  })

  it("still reads an idle server, whose sessions are an empty list, as no streams on every surface", async () => {
    jest.mocked(getTautulliActivity).mockResolvedValue({ success: true, data: { stream_count: "0", sessions: [] } })

    expect(await ask("get_tautulli_activity")).toEqual({ session_count: 0, sessions: [], scope: "caller" })
    for (const output of [
      await executeToolCall(activity, "admin-1", "default", true, MEMBER_ZONE, ADMIN),
      await executeToolCall(activity, "support-1", "default", false, MEMBER_ZONE, SUPPORT),
    ]) {
      expect(isToolError(output)).toBe(false)
      expect(JSON.parse(output)).toEqual({ stream_count: "0", showing: "showing 0 of 0 streams", sessions: [] })
    }
  })
})
