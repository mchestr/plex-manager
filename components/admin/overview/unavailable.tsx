import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"

/** The ErrorState line of a tile whose source failed (5.5): words, not only colour. */
export function Unavailable({ "data-testid": testId }: { "data-testid"?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={testId}>
      <Icon icon={icons.error} size={12} className="text-destructive" />
      Couldn&apos;t load
    </span>
  )
}
