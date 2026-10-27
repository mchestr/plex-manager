/**
 * The concept map of ui-design-system 3.10: one lucide glyph per concept.
 */

import * as lucide from "lucide-react"

import { icons } from "@/lib/ui/icons"

const lucideComponents = new Set<unknown>(Object.values(lucide))

describe("icons", () => {
  it.each(Object.entries(icons))("%s is a lucide component", (_concept, icon) => {
    expect(lucideComponents.has(icon)).toBe(true)
    expect(icon).toEqual(expect.objectContaining({ $$typeof: expect.any(Symbol) }))
  })

  it.each([
    ["plex", "Tv"],
    ["requests", "CirclePlus"],
    ["discord", "MessagesSquare"],
    ["discordBot", "Bot"],
    ["tautulli", "ChartLine"],
    ["sonarr", "TvMinimal"],
    ["radarr", "Film"],
    ["jellyfin", "Server"],
    ["rewind", "Rewind"],
    ["rewindOpen", "Play"],
    ["invites", "Ticket"],
    ["users", "Users"],
    ["announcements", "Megaphone"],
    ["prompts", "FileText"],
    ["playground", "FlaskConical"],
    ["llmUsage", "Activity"],
    ["cost", "Coins"],
    ["queues", "Layers"],
    ["settings", "Settings"],
    ["overview", "LayoutDashboard"],
    ["externalLink", "ArrowUpRight"],
    ["testConnection", "Plug"],
    ["savedSecret", "Lock"],
    ["success", "CircleCheck"],
    ["error", "CircleX"],
    ["warning", "TriangleAlert"],
    ["info", "Info"],
    ["done", "Check"],
    ["close", "X"],
    ["chevronDown", "ChevronDown"],
    ["chevronLeft", "ChevronLeft"],
    ["chevronRight", "ChevronRight"],
  ] as const)("maps %s to lucide %s", (concept, name) => {
    expect(icons[concept]).toBe(lucide[name])
  })
})
