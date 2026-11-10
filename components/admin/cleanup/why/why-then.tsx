import { WhyText } from "@/components/admin/cleanup/results/why-text"
import type { WhySheetData } from "@/lib/cleanup/types/preview"

/**
 * "Then" of the Why Sheet (UX 4.5): what the action does to this title, from
 * `actionWords()` (TS 4.4). The server builds the whole sentence, the Dry run
 * words included ("If the rule is turned on, Radarr deletes ..."), so this
 * part adds no words of its own. Only matches and Leaving soon items have it.
 */
export function WhyThen({ then }: { then: WhySheetData["then"] }) {
  if (!then) return null
  return (
    <div className="flex flex-col gap-1" data-testid="admin-cleanup-why-then">
      <h3 className="text-ui font-semibold text-foreground">Then</h3>
      <p className="text-ui text-foreground">
        <WhyText parts={then.text} className="text-foreground" />
      </p>
    </div>
  )
}
