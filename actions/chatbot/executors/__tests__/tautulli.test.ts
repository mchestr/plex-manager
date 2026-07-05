/**
 * Tests for actions/chatbot/executors/tautulli.ts and the Discord tool gating
 * in actions/chatbot/tools.ts.
 *
 * Covers two Phase 0 bug fixes:
 * 1. get_tautulli_library_stats must invoke the stats client
 *    (getTautulliLibraryStats), NOT the names client (getTautulliLibraryNames).
 * 2. get_tautulli_users must be excluded from the Discord safe-tool set and
 *    never advertised in the generated Discord system prompt.
 */

import { executeTautulliTool } from "../tautulli"
import {
  DISCORD_SAFE_TOOL_NAMES,
  DISCORD_SAFE_TOOLS,
  generateDiscordSystemPrompt,
} from "@/actions/chatbot/tools"
import {
  getTautulliLibraryNames,
  getTautulliLibraryStats,
} from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"

jest.mock("@/lib/prisma", () => ({
  prisma: {
    tautulli: {
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock("@/lib/connections/tautulli", () => ({
  getTautulliLibraryNames: jest.fn(),
  getTautulliLibraryStats: jest.fn(),
  getTautulliUsers: jest.fn(),
}))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

const mockGetTautulliLibraryNames = getTautulliLibraryNames as jest.MockedFunction<
  typeof getTautulliLibraryNames
>
const mockGetTautulliLibraryStats = getTautulliLibraryStats as jest.MockedFunction<
  typeof getTautulliLibraryStats
>
const mockTautulliFindFirst = prisma.tautulli.findFirst as jest.MockedFunction<
  typeof prisma.tautulli.findFirst
>

describe("executeTautulliTool - library stats routing", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockTautulliFindFirst.mockResolvedValue({
      id: "tautulli-1",
      name: "Tautulli",
      url: "http://localhost:8181",
      apiKey: "test-key",
      publicUrl: null,
      isActive: true,
    } as never)
  })

  it("routes get_tautulli_library_stats to the stats client, not the names client", async () => {
    mockGetTautulliLibraryStats.mockResolvedValue({
      success: true,
      data: { response: { data: { data: [{ section_name: "Movies", count: 100 }] } } },
    })

    const result = await executeTautulliTool("get_tautulli_library_stats", {})

    expect(mockGetTautulliLibraryStats).toHaveBeenCalledTimes(1)
    expect(mockGetTautulliLibraryNames).not.toHaveBeenCalled()
    expect(result).toContain("count")
  })

  it("routes get_tautulli_library_names to the names client, not the stats client", async () => {
    mockGetTautulliLibraryNames.mockResolvedValue({
      success: true,
      data: { response: { data: [{ section_name: "Movies" }] } },
    })

    const result = await executeTautulliTool("get_tautulli_library_names", {})

    expect(mockGetTautulliLibraryNames).toHaveBeenCalledTimes(1)
    expect(mockGetTautulliLibraryStats).not.toHaveBeenCalled()
    expect(result).toContain("section_name")
  })

  it("returns different shapes for library_stats vs library_names", async () => {
    const statsData = {
      response: { data: { data: [{ section_name: "Movies", count: 100, parent_count: 0, child_count: 0 }] } },
    }
    const namesData = {
      response: { data: [{ section_name: "Movies", section_id: 1 }] },
    }

    mockGetTautulliLibraryStats.mockResolvedValue({ success: true, data: statsData })
    mockGetTautulliLibraryNames.mockResolvedValue({ success: true, data: namesData })

    const statsResult = await executeTautulliTool("get_tautulli_library_stats", {})
    const namesResult = await executeTautulliTool("get_tautulli_library_names", {})

    expect(statsResult).not.toEqual(namesResult)
    expect(statsResult).toBe(JSON.stringify(statsData))
    expect(namesResult).toBe(JSON.stringify(namesData))
  })

  it("propagates the stats client error for get_tautulli_library_stats", async () => {
    mockGetTautulliLibraryStats.mockResolvedValue({
      success: false,
      error: "Tautulli library stats error: Bad Gateway",
    })

    const result = await executeTautulliTool("get_tautulli_library_stats", {})

    expect(mockGetTautulliLibraryStats).toHaveBeenCalledTimes(1)
    expect(mockGetTautulliLibraryNames).not.toHaveBeenCalled()
    expect(result).toBe(JSON.stringify({ error: "Tautulli library stats error: Bad Gateway" }))
  })
})

describe("Discord tool gating - get_tautulli_users", () => {
  it("excludes get_tautulli_users from the Discord safe-tool set", () => {
    expect(DISCORD_SAFE_TOOL_NAMES.has("get_tautulli_users")).toBe(false)
    expect(DISCORD_SAFE_TOOLS.map((tool) => tool.function.name)).not.toContain(
      "get_tautulli_users"
    )
  })

  it("does not advertise get_tautulli_users in the generated Discord system prompt", () => {
    const prompt = generateDiscordSystemPrompt(DISCORD_SAFE_TOOLS)

    expect(prompt).not.toContain("get_tautulli_users")
  })
})
