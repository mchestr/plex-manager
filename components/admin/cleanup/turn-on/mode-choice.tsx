"use client"

import { useId } from "react"

import { MODE_NAMES, modeAllowed, modeCardText, type TurnOnChoice } from "@/components/admin/cleanup/turn-on/turn-on-words"
import { Badge } from "@/components/ui/badge"
import { RadioCard, RadioGroup } from "@/components/ui/radio-group"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import { cn } from "@/lib/utils"

interface ModeChoiceProps {
  data: CleanupTurnOnData
  mode: TurnOnChoice
  onModeChange: (mode: TurnOnChoice) => void
  /** The id of the card title "At the leave date", which names the group. */
  labelId: string
  /** The leave date as the cards say it: "Dec 8". */
  day: string
}

const TEST_IDS: Record<TurnOnChoice, string> = {
  reviewFirst: "admin-cleanup-turn-on-mode-review-first",
  automatic: "admin-cleanup-turn-on-mode-automatic",
}

/**
 * The two mode cards of "At the leave date" (UX 4.6 right column item 2,
 * 8.7, 11.1 item 8): a `RadioGroup` named by the card title, Review first
 * with the Suggested badge, and Automatic with the `modeSentence` of the
 * rule action. Each card is named by its mode and described by its text.
 *
 * A card that is not allowed is `aria-disabled` (UX 11.3 item 9.3): a
 * choice of it changes nothing, and its description is the reason from the
 * loader ("Needs one finished dry run."). Base UI's arrow keys skip an
 * `aria-disabled` radio, so the reason also shows on the card.
 */
export function ModeChoice({ data, mode, onModeChange, labelId, day }: ModeChoiceProps) {
  const id = useId()
  const choose = (next: TurnOnChoice) => {
    if (modeAllowed(data, next)) onModeChange(next)
  }
  return (
    <RadioGroup<TurnOnChoice> value={mode} onValueChange={choose} aria-labelledby={labelId} data-testid="admin-cleanup-turn-on-mode">
      {(["reviewFirst", "automatic"] as const).map((value) => {
        const allowed = modeAllowed(data, value)
        const reason = data.modes.find((m) => m.mode === value)?.reason
        const nameId = `${id}-${value}-name`
        const badgeId = `${id}-${value}-badge`
        const textId = `${id}-${value}-text`
        return (
          <RadioCard
            key={value}
            value={value}
            aria-labelledby={value === "reviewFirst" ? `${nameId} ${badgeId}` : nameId}
            aria-describedby={textId}
            aria-disabled={allowed ? undefined : true}
            className={cn(!allowed && "cursor-not-allowed bg-muted hover:border-border")}
            data-testid={TEST_IDS[value]}
          >
            <span className="flex flex-wrap items-center gap-2">
              <span id={nameId} className={cn("text-ui font-semibold", allowed ? "text-foreground" : "text-muted-foreground")}>
                {MODE_NAMES[value]}
              </span>
              {value === "reviewFirst" && (
                <Badge id={badgeId} variant="info">
                  Suggested
                </Badge>
              )}
            </span>
            <span id={textId} className="text-label text-muted-foreground">
              {allowed ? modeCardText(data, value, day) : (reason ?? "")}
            </span>
          </RadioCard>
        )
      })}
    </RadioGroup>
  )
}
