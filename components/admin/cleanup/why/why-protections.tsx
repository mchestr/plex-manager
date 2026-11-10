"use client"

import { useId, useState } from "react"

import { WhyText } from "@/components/admin/cleanup/results/why-text"
import { VerdictBadge } from "@/components/admin/cleanup/why/why-conditions"
import { Button } from "@/components/ui/button"
import type { WhySheetData } from "@/lib/cleanup/types/preview"

type Protection = WhySheetData["protections"][number]

/** The verdict words of a protection (UX 8.5). */
const PROTECTION_VERDICTS = {
  protects: { label: "Protects", tint: "success" },
  unknown: { label: "Unknown", tint: "warning" },
  clear: { label: "Clear", tint: "neutral" },
} as const

const isGlobal = (protection: Protection) => /^g\d+$/.test(protection.id)

function Line({ protection }: { protection: Protection }) {
  const verdict = PROTECTION_VERDICTS[protection.verdict]
  return (
    <li
      className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4 py-3 text-ui"
      data-testid={`admin-cleanup-why-protection-${protection.id}`}
    >
      <VerdictBadge label={verdict.label} tint={verdict.tint} className="mt-0.5" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-semibold text-foreground">{protection.label}</p>
        <WhyText parts={protection.value} />
      </div>
    </li>
  )
}

/** "All 10 global protections are clear." (UX 8.5), or the rest of them after the ones listed. */
function foldedWords(count: number, all: boolean): string {
  if (all) return count === 1 ? "The global protection is clear." : `All ${count} global protections are clear.`
  return count === 1 ? "1 other global protection is clear." : `The other ${count} global protections are clear.`
}

/**
 * "Never touch, checked" of the Why Sheet (UX 4.5): the protections that
 * protect come first, each with "Protects" and its real value, then the
 * unknown ones, then the rule's own clear protections. The clear global
 * protections fold into one line with "Show each".
 */
export function WhyProtections({ protections }: { protections: readonly Protection[] }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  if (protections.length === 0) return null

  const by = (verdict: Protection["verdict"]) => protections.filter((p) => p.verdict === verdict)
  const clear = by("clear")
  const listed = [...by("protects"), ...by("unknown"), ...clear.filter((p) => !isGlobal(p))]
  const folded = clear.filter(isGlobal)
  const allGlobalsClear = folded.length === protections.filter(isGlobal).length

  return (
    <div className="flex flex-col gap-1" data-testid="admin-cleanup-why-protections">
      <h3 className="text-ui font-semibold text-foreground">Never touch, checked</h3>
      {listed.length > 0 && (
        <ul className="divide-y">
          {listed.map((protection) => (
            <Line key={protection.id} protection={protection} />
          ))}
        </ul>
      )}
      {folded.length > 0 && (
        <div className="flex flex-col">
          <p className="flex flex-wrap items-center gap-x-2 py-2 text-ui text-muted-foreground">
            {foldedWords(folded.length, allGlobalsClear)}
            <Button
              variant="link"
              size="sm"
              className="h-auto min-h-6 px-0"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => setOpen((value) => !value)}
              data-testid="admin-cleanup-why-show-protections"
            >
              Show each
            </Button>
          </p>
          <ul id={listId} className={open ? "divide-y" : "hidden"}>
            {folded.map((protection) => (
              <Line key={protection.id} protection={protection} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
