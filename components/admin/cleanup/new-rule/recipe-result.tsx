"use client"

import { largestLine } from "@/components/admin/cleanup/new-rule/recipe-words"
import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { sizeText, spokenSize } from "@/components/admin/cleanup/preview/sizes"
import { itemName } from "@/components/admin/cleanup/results/view"
import { WhyText } from "@/components/admin/cleanup/results/why-text"
import { Alert } from "@/components/ui/alert"
import { Icon } from "@/components/ui/icon"
import { Poster } from "@/components/ui/poster"
import { Skeleton } from "@/components/ui/skeleton"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { RecipePreview } from "@/lib/cleanup/types/preview"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

interface RecipeResultProps {
  /** Null until the first result loads. */
  preview: RecipePreview | null
  /** A newer result is on its way: the old one stays at 55 % opacity. */
  updating: boolean
  /** The render's clock, for "today". */
  now: number
}

/**
 * The live result of the recipe step (UX 4.2.2): the matches and their size
 * in a polite live region, the history and data line, the six largest
 * matches, the rule in plain words, the protection and dry run lines and
 * the Dry run notice.
 */
export function RecipeResult({ preview, updating, now }: RecipeResultProps) {
  const f = useFormat()
  if (!preview) {
    return (
      <div className="flex gap-6" data-testid="admin-cleanup-recipe-loading">
        <Skeleton className="h-12 w-24" />
        <Skeleton className="h-12 w-24" />
      </div>
    )
  }
  const noun = nounWord(preview.matches, preview.level)
  const size = sizeText(preview.bytes)
  const lines = [
    preview.historyStart && `Never means no counted play since Tautulli history starts on ${f.date(preview.historyStart)}.`,
    preview.takenAt && `Library data from ${readTimeText(f, preview.takenAt, now)}.`,
  ].filter(Boolean)
  const { zero, globalProtections: globals } = preview

  return (
    <div className={cn("flex flex-col gap-5 transition-opacity", updating && "opacity-55")} aria-busy={updating || undefined}>
      <div className="flex flex-col gap-2">
        <div aria-hidden="true" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-10">
          <div className="flex flex-col gap-0.5">
            <p className="text-stat tabular-nums" data-testid="admin-cleanup-recipe-count">
              {f.number(preview.matches)}
            </p>
            <p className="text-label text-muted-foreground">
              {noun} of {f.number(preview.checked)} checked
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-stat tabular-nums" data-testid="admin-cleanup-recipe-bytes">
              {size}
            </p>
            <p className="text-label text-muted-foreground">up to</p>
          </div>
        </div>
        <p aria-live="polite" className="sr-only">
          {updating ? "" : `${f.number(preview.matches)} ${noun} of ${f.number(preview.checked)} checked. Up to ${spokenSize(size)}.`}
        </p>
        {lines.length > 0 && <p className="text-label text-muted-foreground">{lines.join(" ")}</p>}
        {preview.matches === 0 && zero && (
          <p className="text-ui text-foreground">
            &quot;{zero.sentence}&quot; leaves {f.number(zero.leaves)} of {f.number(zero.of)}.
            {zero.largestBytes !== null && ` The largest ${nounWord(1, preview.level)} that passes the other conditions is ${sizeText(zero.largestBytes)}.`}
          </p>
        )}
      </div>

      {preview.largest.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-ui font-medium text-foreground">Largest matches</h3>
          <ul className="grid grid-cols-6 gap-2" aria-label="Largest matches">
            {preview.largest.slice(0, 6).map((item) => (
              <li key={item.itemKey}>
                <Poster ratingKey={item.posterKey} title={itemName(item)} size="xs" style={{ width: "100%" }} />
              </li>
            ))}
          </ul>
          <p className="text-label text-muted-foreground">{largestLine(preview)}.</p>
        </div>
      )}

      <div className="flex flex-col gap-1 rounded-md border bg-muted px-4 py-3" data-testid="admin-cleanup-recipe-plain-words">
        <p className="text-label text-muted-foreground">In plain words</p>
        <p className="text-ui">
          <WhyText parts={preview.sentence} className="text-foreground" />
        </p>
      </div>

      <ul className="flex flex-col gap-2 text-ui text-muted-foreground">
        <li className="flex items-start gap-2">
          <Icon icon={icons.keep} className="mt-0.5" />
          <span>
            {f.number(globals)} global {globals === 1 ? "protection keeps" : "protections keep"} {f.number(preview.protectedCount)}{" "}
            {nounWord(preview.protectedCount, preview.level)} safe.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Icon icon={icons.conversationHistory} className="mt-0.5" />
          <span>When you create the rule, a dry run starts at once.</span>
        </li>
      </ul>

      <Alert tone="info" title="The rule starts in Dry run">
        It records its matches and changes nothing. Members see nothing until you turn it on.
      </Alert>
    </div>
  )
}
