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
    ["rewind", "Rewind"],
    ["rewindOpen", "Play"],
    ["invites", "Ticket"],
    ["users", "Users"],
    ["announcements", "Megaphone"],
    ["email", "Mail"],
    ["llmUsage", "Activity"],
    ["automations", "Workflow"],
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
    // Media cleanup (TS 12.5) and the mixed checkbox
    ["cleanup", "BrushCleaning"],
    ["leavingSoon", "Hourglass"],
    ["keep", "ShieldCheck"],
    ["exclude", "ShieldMinus"],
    ["postpone", "CalendarClock"],
    ["group", "ListTree"],
    ["cannotDelete", "Ban"],
    ["indeterminate", "Minus"],
    ["playing", "Play"],
    ["paused", "Pause"],
    ["pending", "Clock"],
  ] as const)("maps %s to lucide %s", (concept, name) => {
    expect(icons[concept]).toBe(lucide[name])
  })
})
