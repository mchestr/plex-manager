"use client"

import { SETTINGS_GROUPS, type SettingsGroupId, type SettingsNavItem } from "@/components/admin/settings/settings-groups"
import { Icon } from "@/components/ui/icon"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { settingsCategory, type ConnectionStatus, type Tone } from "@/lib/ui/status"
import { cn } from "@/lib/utils"

const TONE_TEXT: Partial<Record<Tone, string>> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
}

/** The 12px category glyph (5.6): a shape per category, with its name for screen readers. */
function StatusGlyph({ status, decorative = false }: { status: ConnectionStatus; decorative?: boolean }) {
  const category = settingsCategory(status)
  return (
    <Icon
      icon={category.icon}
      size={12}
      label={decorative ? undefined : category.label}
      className={TONE_TEXT[category.tone] ?? "text-muted-foreground"}
      data-category={category.category}
    />
  )
}

function DirtyPip({ decorative = false }: { decorative?: boolean }) {
  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "Unsaved changes" })}
      className="size-2 shrink-0 rounded-full bg-primary-indicator"
    />
  )
}

const LEGEND: { status: ConnectionStatus; label: string }[] = [
  { status: "ok", label: "Working" },
  { status: "incomplete", label: "Needs attention" },
  { status: "unreachable", label: "Not working" },
  { status: "notConfigured", label: "Off, not set up or not checked" },
]

interface SettingsNavProps {
  items: SettingsNavItem[]
  /** The section in view, from the layout's IntersectionObserver. */
  active: string | null
  activeGroup: SettingsGroupId
  dirty: ReadonlySet<string>
  /** Reveals the section's group and scrolls to it. */
  onSelect: (id: string) => void
}

/**
 * The settings section nav (ui-design-system 6.4): grouped links, each with
 * its tone glyph and the unsaved-changes pip, and the legend under them. The
 * page shows one group at a time, so the active group's heading is marked.
 */
export function SettingsNav({ items, active, activeGroup, dirty, onSelect }: SettingsNavProps) {
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-4" data-testid="settings-nav">
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.id} className="flex flex-col gap-0.5" data-testid={`settings-nav-group-${group.id}`}>
          <p data-active={activeGroup === group.id || undefined} className="px-2 pb-1 text-caption font-medium text-muted-foreground data-active:text-foreground">
            {group.label}
          </p>
          {items
            .filter((item) => item.group === group.id)
            .map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={active === item.id ? "true" : undefined}
                onClick={(event) => {
                  event.preventDefault()
                  onSelect(item.id)
                }}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-ui text-muted-foreground hover:bg-accent hover:text-foreground",
                  "aria-[current=true]:bg-accent aria-[current=true]:text-foreground"
                )}
                data-testid={`settings-nav-${item.id}`}
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {dirty.has(item.id) && <DirtyPip />}
                {item.status && <StatusGlyph status={item.status} />}
              </a>
            ))}
        </div>
      ))}
      <ul aria-hidden="true" className="flex flex-col gap-1.5 border-t pt-4 text-caption text-muted-foreground" data-testid="settings-nav-legend">
        {LEGEND.map((entry) => (
          <li key={entry.label} className="flex items-center gap-2">
            <StatusGlyph status={entry.status} decorative />
            {entry.label}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="flex w-3 justify-center">
            <DirtyPip decorative />
          </span>
          Unsaved changes
        </li>
      </ul>
    </nav>
  )
}

/** Below `md`: the nav as a "Jump to" Select that reveals and scrolls to the section. */
export function SettingsJumpTo({ items, active, onSelect }: Pick<SettingsNavProps, "items" | "active" | "onSelect">) {
  const selectItems = items.map((item) => ({ value: item.id, label: item.label }))
  return (
    <Select items={selectItems} value={active ?? items[0]?.id ?? null} onValueChange={(id) => typeof id === "string" && onSelect(id)}>
      <SelectTrigger aria-label="Jump to section" data-testid="settings-jump-to">
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">Jump to</span>
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {SETTINGS_GROUPS.map((group) => (
          <SelectGroup key={group.id}>
            <SelectLabel>{group.label}</SelectLabel>
            {items
              .filter((item) => item.group === group.id)
              .map((item) => (
                <SelectItem key={item.id} value={item.id} label={item.label} data-testid={`settings-jump-to-option-${item.id}`}>
                  {item.label}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
