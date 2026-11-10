import { WhyText } from "@/components/admin/cleanup/results/why-text"
import type { WhySheetData } from "@/lib/cleanup/types/preview"

/** The words before the Then sentence of a Dry run rule (UX 4.5, 8.5). */
const DRY_RUN_PREFIX = "If the rule is turned on, "

/**
 * "Then" of the Why Sheet (UX 4.5): what the action does to this title, from
 * `actionWords()` (TS 4.4). The server builds the sentence; a Dry run rule
 * reads "If the rule is turned on, Radarr deletes ...". The prefix shows once,
 * whether or not the server put it in the text. Only matches and Leaving soon
 * items have it.
 */
export function WhyThen({ then }: { then: WhySheetData["then"] }) {
  if (!then) return null
  return (
    <div className="flex flex-col gap-1" data-testid="admin-cleanup-why-then">
      <h3 className="text-ui font-semibold text-foreground">Then</h3>
      <p className="text-ui text-foreground">
        {then.dryRun && !then.text[0]?.text.startsWith(DRY_RUN_PREFIX) && DRY_RUN_PREFIX}
        <WhyText parts={then.text} className="text-foreground" />
      </p>
    </div>
  )
}
