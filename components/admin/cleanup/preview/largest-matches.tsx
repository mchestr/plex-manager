import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { itemName } from "@/components/admin/cleanup/results/view"
import { Button } from "@/components/ui/button"
import { Poster } from "@/components/ui/poster"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"

/**
 * The "Largest matches" heading (`tabIndex={-1}`): where focus goes when an
 * action from a Why Sheet removes a row of this list (UX 7.9, ux-a11y-r8-1).
 */
export const LARGEST_MATCHES_HEADING_ID = "admin-cleanup-preview-largest-heading"

interface LargestMatchesProps {
  /** Up to 4 matches, largest first (UX 4.3.6). */
  items: PreviewResponse["largest"]
  /** Opens the Why Sheet of a title. */
  onWhy: (itemKey: string) => void
}

/**
 * "Largest matches" on the preview card (UX 4.3.6): a small poster, the
 * title and year, the short Why text (muted, as a hint) and the size of each,
 * with "Why" as the row's one action. Nothing shows while the rule matches nothing.
 */
export function LargestMatches({ items, onWhy }: LargestMatchesProps) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-3" data-testid="admin-cleanup-preview-largest">
      <h3 id={LARGEST_MATCHES_HEADING_ID} tabIndex={-1} className="text-ui font-medium text-foreground outline-none">
        Largest matches
      </h3>
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const name = itemName(item)
          return (
            <li key={item.itemKey} className="flex items-center gap-3">
              <Poster ratingKey={item.posterKey} title={name} size="xs" style={{ width: 32 }} decorative />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-ui">
                  <span className="font-medium text-foreground">{name}</span>
                  {item.year !== null && <span className="text-muted-foreground"> ({item.year})</span>}
                </p>
                <p className="line-clamp-2 text-label text-muted-foreground">{item.why.map((part) => part.text).join("")}</p>
              </div>
              <p className="text-ui whitespace-nowrap text-foreground tabular-nums">{sizeText(item.sizeBytes)}</p>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Why: ${name}`}
                onClick={() => onWhy(item.itemKey)}
                data-testid={`admin-cleanup-preview-largest-${item.itemKey}-why`}
              >
                Why
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
