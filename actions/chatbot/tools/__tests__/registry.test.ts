/**
 * Drift guard for the derived tool registry.
 *
 * The Discord-safe tool set is the security keystone of the chatbot: it must be
 * DERIVED from per-tool metadata and must never silently gain or lose members.
 * These tests pin the historical safe set and enforce the security invariants
 * that let us trust the derived set.
 */

import { ALL_TOOLS, DISCORD_SAFE_TOOLS, DISCORD_SAFE_TOOL_NAMES } from "@/actions/chatbot/tools/registry"

/**
 * The exact 14-tool Discord safe set as it existed before the registry
 * refactor (the former DISCORD_SAFE_TOOL_NAME_LIST literal). Hardcoded here so
 * any accidental change to a `discordSafe` flag fails loudly.
 */
const HISTORICAL_DISCORD_SAFE_TOOL_NAMES = [
  "get_plex_status",
  "get_plex_sessions",
  "get_tautulli_status",
  "get_tautulli_activity",
  "get_overseerr_status",
  "get_sonarr_status",
  "get_sonarr_queue",
  "get_sonarr_history",
  "get_radarr_status",
  "get_radarr_queue",
  "get_radarr_history",
  "mark_media_finished",
  "mark_media_keep",
  "get_my_marks",
]

/**
 * Discord-safe tools that are inherently global (no per-user scoping) but are
 * still non-sensitive: server status, download queues, and download history.
 * Every discordSafe tool must be either userScoped or in this allowlist.
 */
const INHERENTLY_GLOBAL_DISCORD_TOOLS = new Set<string>([
  "get_plex_status",
  "get_tautulli_status",
  "get_overseerr_status",
  "get_sonarr_status",
  "get_sonarr_queue",
  "get_sonarr_history",
  "get_radarr_status",
  "get_radarr_queue",
  "get_radarr_history",
])

describe("chatbot tool registry drift guard", () => {
  it("DISCORD_SAFE_TOOLS is a subset of ALL_TOOLS", () => {
    const allNames = new Set(ALL_TOOLS.map((tool) => tool.function.name))
    for (const tool of DISCORD_SAFE_TOOLS) {
      expect(allNames.has(tool.function.name)).toBe(true)
    }
  })

  it("every discordSafe tool resolves to a real registered tool", () => {
    const byName = new Map(ALL_TOOLS.map((tool) => [tool.function.name, tool]))
    for (const name of DISCORD_SAFE_TOOL_NAMES) {
      expect(byName.get(name)).toBeDefined()
      expect(byName.get(name)?.discordSafe).toBe(true)
    }
  })

  it("derived safe set exactly equals the historical safe list", () => {
    const derived = [...DISCORD_SAFE_TOOL_NAMES].sort()
    const historical = [...HISTORICAL_DISCORD_SAFE_TOOL_NAMES].sort()
    expect(derived).toEqual(historical)
    expect(DISCORD_SAFE_TOOLS).toHaveLength(HISTORICAL_DISCORD_SAFE_TOOL_NAMES.length)
  })

  it("every discordSafe tool is userScoped or an inherently global tool", () => {
    const byName = new Map(ALL_TOOLS.map((tool) => [tool.function.name, tool]))
    for (const name of DISCORD_SAFE_TOOL_NAMES) {
      const tool = byName.get(name)
      const isSafeShape = Boolean(tool?.userScoped) || INHERENTLY_GLOBAL_DISCORD_TOOLS.has(name)
      expect(isSafeShape).toBe(true)
    }
  })

  it("ALL_TOOLS names are unique", () => {
    const names = ALL_TOOLS.map((tool) => tool.function.name)
    expect(new Set(names).size).toBe(names.length)
  })
})
