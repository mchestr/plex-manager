"use client"

import Link from "next/link"
import { type ReactNode, useId, useLayoutEffect, useState } from "react"

import { kebab } from "@/components/admin/cleanup/editor/condition-editor/editor-parts"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ChoiceChips } from "@/components/ui/choice-chips"
import { Fieldset } from "@/components/ui/fieldset"
import { Icon } from "@/components/ui/icon"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { RadioCard, RadioGroup } from "@/components/ui/radio-group"
import { Token } from "@/components/ui/token"
import { cleanup } from "@/lib/admin/routes"
import { ACTION_LABELS } from "@/lib/cleanup/action-words"
import { automaticGraceMessage } from "@/lib/cleanup/editor/errors"
import { durationWords, NOUNS } from "@/lib/cleanup/fields/words"
import { useFormat } from "@/lib/format-context"
import { addDays } from "@/lib/ui/date-range"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"
import { dayKey } from "@/lib/utils/zoned-time"
import type { RuleThen } from "@/lib/validations/cleanup-rule"
import { ACTIONS, type ActionId, type Level, type Mode } from "@/lib/validations/cleanup-vocabulary"

/** The grace chips (UX 5.5). "Other" takes 1 to 3650 days. */
const GRACE_PRESETS = ["14", "30", "60", "90"] as const
/** Below this, members get less than 2 weeks to keep a title (UX 7.6 item 3). */
const SHORT_GRACE = 14

const MODE_LINES: Record<Mode, { name: string; text: string }> = {
  dryRun: { name: "Dry run", text: "Runs record matches and change nothing. To change the mode, use Turn on." },
  reviewFirst: { name: "Review first", text: "At the leave date, items wait for your approval. To change the mode, use Change mode." },
  automatic: { name: "Automatic", text: "At the leave date, items are deleted inside the daily budget. To change the mode, use Change mode." },
}

/** On a phone a long action token wraps inside itself, so "then [token]" stays together (UX 4.3.8 item 8). */
const WRAPS = "min-w-0 max-md:h-auto max-md:min-h-9 max-md:py-1.5 max-md:text-left max-md:whitespace-normal"

interface ThenFieldsetProps {
  then: Partial<RuleThen>
  level: Level
  mode: Mode
  /** The shortest grace period in Automatic (Settings, default 7). */
  minGrace: number
  /** The server zone, for the first leave date. */
  zone: string
  /** A save error of a Then part. */
  error?: string | null
  onThen: (patch: Partial<RuleThen>) => void
  /** An error link to Then opens the grace or the action list (UX 7.9). A new object opens it once. */
  openRequest?: { name: "grace" | "action" } | null
}

/**
 * The last part of the sentence (UX 4.3.3, 5.5): "Put matches in Leaving
 * soon for [30 days], then [delete the movie and its files in Radarr]." The
 * grace token opens chips with "Other"; the action token opens a radio list
 * (read only for seasons, which have one action). Delete actions add the
 * import list exclusion checkbox. Under it, the short-grace warning, the
 * Automatic floor error, and the three info lines: Plex visibility, the first
 * leave date and the mode.
 */
export function ThenFieldset({ then, level, mode, minGrace, zone, error, onThen, openRequest }: ThenFieldsetProps) {
  const ids = useId()
  const f = useFormat()
  const [now] = useState(() => Date.now())
  const [open, setOpen] = useState<"grace" | "action" | null>(null)
  const [other, setOther] = useState(false)
  const [request, setRequest] = useState(openRequest)
  if (openRequest !== request) {
    setRequest(openRequest)
    if (openRequest) setOpen(openRequest.name)
  }
  // The router keeps a page it leaves (Activity): a list closes as the page hides (TS 12.1 rule 8.2)
  useLayoutEffect(() => () => setOpen(null), [])

  const grace = then.graceDays
  const action = then.action
  const actions: readonly ActionId[] = ACTIONS[level]
  const preset = GRACE_PRESETS.find((days) => Number(days) === grace) ?? null
  const otherOn = other || (grace !== undefined && preset === null)
  const deletes = action?.endsWith(".delete") ?? false
  const tooShort = mode === "automatic" && grace !== undefined && grace < minGrace
  const shown = error ?? (tooShort ? automaticGraceMessage(minGrace) : null)
  const leaveOn = grace === undefined ? null : f.dayKey(addDays(dayKey(now, zone), grace))
  const opened = (which: "grace" | "action") => (next: boolean) => setOpen(next ? which : null)

  const actionToken = (state: "default" | "open" | "readOnly") => (
    <Token part="value" partLabel="action" state={state} className={WRAPS} data-testid="admin-cleanup-then-action">
      {action ? ACTION_LABELS[action] : "Choose an action"}
    </Token>
  )

  return (
    <Fieldset legend="Then">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-body text-foreground">
        <span>Put matches in Leaving soon for</span>
        <Popover open={open === "grace"} onOpenChange={opened("grace")}>
          <PopoverTrigger
            render={
              <Token
                part="value"
                partLabel="grace period"
                state={open === "grace" ? "open" : shown ? "error" : grace === undefined ? "incomplete" : "default"}
                aria-describedby={shown ? `${ids}-error` : undefined}
                data-testid="admin-cleanup-then-grace"
              >
                {grace === undefined ? "Choose a grace period" : durationWords({ amount: grace, unit: "days" })}
              </Token>
            }
          />
          <PopoverContent align="start" className="w-80 gap-3">
            <PopoverTitle id={`${ids}-grace`}>Grace period</PopoverTitle>
            <ChoiceChips<(typeof GRACE_PRESETS)[number]>
              aria-labelledby={`${ids}-grace`}
              value={otherOn ? null : preset}
              onValueChange={(days) => {
                setOther(false)
                onThen({ graceDays: Number(days) })
              }}
              options={GRACE_PRESETS.map((days) => ({ value: days, label: `${days} days` }))}
              other={{
                label: "Other",
                checked: otherOn,
                onSelect: () => setOther(true),
                unit: "days",
                value: grace ?? null,
                onValueChange: (days) => {
                  if (days !== null && Number.isInteger(days) && days >= 1 && days <= 3650) onThen({ graceDays: days })
                },
                min: 1,
                max: 3650,
                "data-testid": "admin-cleanup-then-grace-other-input",
              }}
              data-testid="admin-cleanup-then-grace-chips"
            />
          </PopoverContent>
        </Popover>
        <span className="-ml-1.5">,</span>
        <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 whitespace-nowrap">
          then
          {actions.length === 1 && action === actions[0] ? (
            actionToken("readOnly")
          ) : (
            <Popover open={open === "action"} onOpenChange={opened("action")}>
              <PopoverTrigger render={actionToken(open === "action" ? "open" : "default")} />
              <PopoverContent align="start" className="w-96 gap-2">
                <PopoverTitle id={`${ids}-action`}>Action</PopoverTitle>
                <RadioGroup<ActionId>
                  aria-labelledby={`${ids}-action`}
                  value={action ?? null}
                  onValueChange={(next) => {
                    setOpen(null)
                    onThen({ action: next })
                  }}
                  className="gap-0.5"
                >
                  {actions.map((id) => (
                    <RadioCard key={id} value={id} className={COMPACT} data-testid={`admin-cleanup-then-action-${kebab(id)}`}>
                      <span className="text-ui text-foreground">{ACTION_LABELS[id]}</span>
                    </RadioCard>
                  ))}
                </RadioGroup>
              </PopoverContent>
            </Popover>
          )}
          <span>.</span>
        </span>
      </p>
      {shown && (
        <p id={`${ids}-error`} className="text-label text-destructive">
          {shown}
        </p>
      )}
      {deletes && (
        <div className="flex items-start gap-2">
          <Checkbox
            id={`${ids}-exclusion-box`}
            checked={then.importListExclusion ?? false}
            onCheckedChange={(checked) => onThen({ importListExclusion: checked })}
            aria-describedby={`${ids}-exclusion`}
            className="mt-0.5"
            data-testid="admin-cleanup-then-exclusion"
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={`${ids}-exclusion-box`}>Add an import list exclusion</Label>
            <p id={`${ids}-exclusion`} className="text-label text-muted-foreground">
              Import lists do not download the {NOUNS[level][0]} again.
            </p>
          </div>
        </div>
      )}
      {grace !== undefined && grace < SHORT_GRACE && (
        <Alert tone="warning" role="status" title="Members get less than 2 weeks">
          A grace period of {durationWords({ amount: grace, unit: "days" })} is short. Automatic needs at least {minGrace} days.
        </Alert>
      )}
      <ul className="flex flex-col gap-1.5 text-label text-muted-foreground">
        <Info icon={icons.plex}>
          {mode === "dryRun"
            ? "Members see Leaving soon on Plex Home and in the app once this rule leaves Dry run. "
            : "Members see Leaving soon on Plex Home and in the app. "}
          <Button
            variant="link"
            size="sm"
            nativeButton={false}
            render={<Link href={cleanup({ tab: "settings", section: "cleanup-plex" })} />}
            className="h-auto px-0 text-label"
            data-testid="admin-cleanup-then-plex-link"
          >
            Change where in Settings
          </Button>
        </Info>
        {leaveOn && (
          <Info icon={icons.scheduled}>
            {mode === "dryRun" ? "Turned on today, the first leave date is " : "A title that joins Leaving soon today leaves on "}
            <strong className="font-semibold text-foreground">{leaveOn}</strong>.
          </Info>
        )}
        <Info icon={icons.info}>
          Mode: <strong className="font-semibold text-foreground">{MODE_LINES[mode].name}</strong>. {MODE_LINES[mode].text}
        </Info>
      </ul>
    </Fieldset>
  )
}

const COMPACT = "items-center rounded-md border-transparent bg-transparent px-2 py-1.5 hover:border-transparent hover:bg-accent data-checked:border-transparent"

function Info({ icon, children }: { icon: Parameters<typeof Icon>[0]["icon"]; children: ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2")}>
      <Icon icon={icon} className="mt-0.5 text-muted-foreground" />
      <span className="min-w-0">{children}</span>
    </li>
  )
}
