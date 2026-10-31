/**
 * Drift guard for the derived tool registry.
 *
 * The Discord-safe tool set is the security keystone of the chatbot: it must be
 * DERIVED from per-tool metadata and must never silently gain or lose members.
 * These tests pin the historical safe set and enforce the security invariants
 * that let us trust the derived set.
 */

import { generateDiscordSystemPrompt } from "@/lib/chatbot/prompts/discord-system-prompt"
import {
  ALL_TOOLS,
  DISCORD_ADMIN_ONLY_TOOL_NAMES,
  DISCORD_SAFE_TOOLS,
  DISCORD_SAFE_TOOL_NAMES,
} from "@/lib/chatbot/tools/registry"

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
  it("app-data tools are admin-only: registered, never discordSafe", () => {
    const names = ["get_app_invites", "get_app_member", "get_app_failed_jobs"]
    for (const name of names) {
      const tool = ALL_TOOLS.find((t) => t.function.name === name)
      expect(tool).toBeDefined()
      expect(tool?.discordSafe).toBeFalsy()
      expect(DISCORD_SAFE_TOOL_NAMES.has(name)).toBe(false)
    }
  })

  it("knowledge base tools are admin-only: registered, never discordSafe", () => {
    for (const name of ["search_knowledge_base", "read_knowledge_doc"]) {
      expect(ALL_TOOLS.find((t) => t.function.name === name)).toBeDefined()
      expect(DISCORD_SAFE_TOOL_NAMES.has(name)).toBe(false)
    }
  })

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

  // Step 19 (FR-14): the Discord admin-only tier is the whole-server download
  // queue/history tools, DERIVED from the `discordAdminOnly` flag. Pin the exact
  // set so it can't silently grow (which would over-restrict members) or shrink
  // (which would leak server-wide data to non-admins).
  it("DISCORD_ADMIN_ONLY_TOOL_NAMES is exactly the server-wide queue/history tools", () => {
    expect([...DISCORD_ADMIN_ONLY_TOOL_NAMES].sort()).toEqual(
      ["get_radarr_history", "get_radarr_queue", "get_sonarr_history", "get_sonarr_queue"].sort()
    )
  })

  it("every admin-only tool is also Discord-safe (the tier is a subset)", () => {
    for (const name of DISCORD_ADMIN_ONLY_TOOL_NAMES) {
      expect(DISCORD_SAFE_TOOL_NAMES.has(name)).toBe(true)
    }
  })

  it("member-ok safe tools (userScoped or *_status) are NOT admin-only", () => {
    const byName = new Map(ALL_TOOLS.map((tool) => [tool.function.name, tool]))
    for (const name of DISCORD_SAFE_TOOL_NAMES) {
      const tool = byName.get(name)
      const isMemberOk = Boolean(tool?.userScoped) || name.endsWith("_status")
      if (isMemberOk) {
        expect(DISCORD_ADMIN_ONLY_TOOL_NAMES.has(name)).toBe(false)
      }
    }
  })
})

describe("what the Discord model reads", () => {
  const byName = new Map(ALL_TOOLS.map((tool) => [tool.function.name, tool]))

  it("is each tool's discordDescription when it has one, else its description, under the same name", () => {
    for (const tool of DISCORD_SAFE_TOOLS) {
      const registered = byName.get(tool.function.name)
      expect(tool.function.description).toBe(registered?.discordDescription ?? registered?.function.description)
    }
    // The admin assistant and MCP keep the full description
    expect(byName.get("get_sonarr_history")?.function.description).toContain("IMPORTANT: Use seriesId or episodeId")
  })

  // A description that promised a dropped field told a Discord admin no reason was recorded; one that
  // pointed at a tool the Discord set lacks got the call refused (DISCORD_COMMAND_DENIED)
  it.each(["get_sonarr_history", "get_sonarr_queue", "get_radarr_history", "get_radarr_queue"])(
    "%s promises only what Discord keeps and names no tool or id Discord cannot use",
    (name) => {
      const description = DISCORD_SAFE_TOOLS.find((tool) => tool.function.name === name)?.function.description ?? ""
      const unusable = ALL_TOOLS.map((tool) => tool.function.name).filter((other) => !DISCORD_SAFE_TOOL_NAMES.has(other))

      expect(description).not.toBe(byName.get(name)?.function.description)
      expect(description).not.toMatch(/download client|when it was added|indexer|seriesId|episodeId|movieId|sonarrId|radarrId/)
      for (const other of unusable) expect(description).not.toContain(other)
      expect(description).toMatch(name.startsWith("get_sonarr") ? /seriesName/ : /movieName/)
    }
  )

  it("keeps why a download failed in the history tools' Discord allowlists", () => {
    expect(byName.get("get_sonarr_history")?.discordFields).toContain("message")
    expect(byName.get("get_radarr_history")?.discordFields).toContain("message")
  })

  it("is what the Discord prompt lists", () => {
    const prompt = generateDiscordSystemPrompt(DISCORD_SAFE_TOOLS, { format: { timeZone: "UTC", locale: "en-US" }, now: new Date("2026-10-31T12:00:00Z") })

    expect(prompt).toContain(`- get_radarr_queue: ${byName.get("get_radarr_queue")?.discordDescription}`)
    expect(prompt).not.toMatch(/get_sonarr_episodes|search_sonarr_series|search_radarr_movies|download client, when it was added/)
  })
})

describe("Discord parameters", () => {
  const discord = (name: string) => DISCORD_SAFE_TOOLS.find((tool) => tool.function.name === name)?.function.parameters
  const full = (name: string) => ALL_TOOLS.find((tool) => tool.function.name === name)?.function.parameters
  const names = (parameters: Record<string, unknown> | undefined) => Object.keys((parameters?.properties ?? {}) as Record<string, unknown>).sort()

  it.each([
    ["get_sonarr_history", ["seriesId", "episodeId"]],
    ["get_sonarr_queue", ["seriesId"]],
    ["get_radarr_history", ["movieId"]],
    ["get_radarr_queue", ["movieId"]],
  ])("shows the Discord model %s without the ids it cannot look up", (name, hidden) => {
    expect(names(discord(name))).toEqual(names(full(name)).filter((property) => !hidden.includes(property)))
    for (const property of hidden) expect(names(full(name))).toContain(property)
  })

  it("leaves every other Discord tool's parameters as they are", () => {
    const hiding = new Set(["get_sonarr_history", "get_sonarr_queue", "get_radarr_history", "get_radarr_queue"])
    for (const tool of DISCORD_SAFE_TOOLS.filter((candidate) => !hiding.has(candidate.function.name))) {
      expect(tool.function.parameters).toEqual(full(tool.function.name))
    }
  })
})
