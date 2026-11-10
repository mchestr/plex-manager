"use client"

import Link from "next/link"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Icon } from "@/components/ui/icon"
import { Token } from "@/components/ui/token"
import { cleanup } from "@/lib/admin/routes"
import { GLOBAL_LEVELS } from "@/lib/cleanup/engine/protections"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { EditorGlobalProtection } from "@/lib/cleanup/types/rule-parts"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

interface GlobalProtectionsLineProps {
  level: Level
  /** Every global protection, with its on or off state. */
  protections: readonly EditorGlobalProtection[]
  /** The items each protection keeps safe in this rule's preview, by id ("g4"). */
  counts: ReadonlyMap<string, number>
  /** The items that pass every condition and that a protection keeps safe. */
  kept: number
}

/** "Always on: **10 global protections** keep 17 movies safe." (UX 4.3.5, UX 8.4) */
function Summary({ on, kept, level }: { on: number; kept: number; level: Level }) {
  const f = useFormat()
  return (
    <>
      Always on: <strong className="font-semibold text-foreground">{on === 1 ? "1 global protection" : `${on} global protections`}</strong>{" "}
      {on === 1 ? "keeps" : "keep"} {f.number(kept)} {nounWord(kept, level)} safe.
    </>
  )
}

/**
 * The global protections of "Never touch" (UX 4.3.5): a muted bordered line
 * with a lock, the count of the protections that are on for the level (12
 * for seasons, which add G11 and G12), "Show each" with a read-only token and
 * a count for each, and "Change in Settings". On a phone the line is one row
 * button (`-row`) that opens the same list (UX 4.3.8 item 4); from `md` the
 * "Show each" button (`-show`) does. Both stay in the DOM with their own ids.
 */
export function GlobalProtectionsLine({ level, protections, counts, kept }: GlobalProtectionsLineProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const f = useFormat()
  // The level can change in the editor, so the levels come from the protection, not the loaded level (UX 5.4.1 item 3)
  const on = protections.filter((p) => p.enabled && GLOBAL_LEVELS[p.id].includes(level))

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="flex flex-col rounded-md border bg-muted/40 text-ui text-muted-foreground md:flex-row md:flex-wrap md:items-center"
      data-testid="admin-cleanup-global-protections"
    >
      <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 py-2 pl-3 md:flex">
        <Icon icon={icons.savedSecret} className="text-muted-foreground" />
        <p className="min-w-0 flex-1">
          <Summary on={on.length} kept={kept} level={level} />
        </p>
        <CollapsibleTrigger
          render={<Button variant="ghost" size="sm" data-testid="admin-cleanup-global-protections-show" />}
        >
          Show each
        </CollapsibleTrigger>
      </div>
      <Button
        variant="ghost"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
        className="h-auto min-h-11 w-full justify-start gap-3 px-3 py-2.5 text-left font-normal whitespace-normal text-muted-foreground md:hidden"
        data-testid="admin-cleanup-global-protections-row"
      >
        <Icon icon={icons.savedSecret} />
        <span className="min-w-0 flex-1">
          <Summary on={on.length} kept={kept} level={level} />
        </span>
        <Icon icon={open ? icons.chevronDown : icons.chevronRight} />
      </Button>
      <CollapsiblePanel id={panelId} className="md:order-3 md:basis-full">
        <ul className="flex flex-wrap gap-2 border-t px-3 py-3" aria-label="Global protections">
          {on.map((p) => (
            <li key={p.id} className="flex items-center gap-1.5">
              <Token part="extra" state="readOnly" data-testid={`admin-cleanup-global-protection-${p.id}`}>
                {p.sentence}
              </Token>
              <span className="text-label text-muted-foreground tabular-nums">{f.number(counts.get(p.id) ?? 0)}</span>
            </li>
          ))}
        </ul>
      </CollapsiblePanel>
      <div className={cn("flex justify-end px-3 pb-2 md:order-2 md:py-2 md:pr-3 md:pl-0", open && "max-md:pt-1")}>
        <Button
          variant="link"
          size="sm"
          nativeButton={false}
          render={<Link href={cleanup({ tab: "settings", section: "cleanup-protections" })} />}
          className="px-0"
          data-testid="admin-cleanup-global-protections-settings"
        >
          Change in Settings
        </Button>
      </div>
    </Collapsible>
  )
}
