"use client"

import { ChevronLeft, ChevronRight, Share, Table } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

interface ChromeBottomProps {
  /** The page has a registry `table`, so the Table sheet can open. */
  hasTable: boolean
  /** The centrefold shares its poster with the solid button. */
  poster: boolean
  /** The back cover carries its own share actions, so the pill stays away. */
  share: boolean
  canGoBack: boolean
  canGoForward: boolean
  onTable: () => void
  onShare: () => void
  onPrev: () => void
  onNext: () => void
}

/**
 * The bottom chrome: "Table" on chart pages and "Share this page", which is
 * the solid "Share the poster" on the centrefold (design 4.6). The back
 * cover has neither: its page carries the share actions (4.3 page 18). The page-turn
 * buttons are the tap zones' and swipes' equivalents (WCAG 2.5.7); they stay
 * out of sight until they take keyboard focus.
 */
export function ChromeBottom({ hasTable, poster, share, canGoBack, canGoForward, onTable, onShare, onPrev, onNext }: ChromeBottomProps) {
  const reveal = "sr-only focus-visible:not-sr-only"
  return (
    <div className="flex h-11 items-center justify-center gap-2.5 font-display">
      {canGoBack && (
        <Button variant="ink-outline" size="pill" className={reveal} data-testid="rewind-prev" onClick={onPrev} icon={<Icon icon={ChevronLeft} />}>
          Previous page
        </Button>
      )}
      {hasTable && (
        <Button variant="ink-outline" size="pill" aria-haspopup="dialog" data-testid="rewind-table-toggle" onClick={onTable} icon={<Icon icon={Table} />}>
          Table
        </Button>
      )}
      {!share ? null : poster ? (
        <Button variant="ink" size="pill" aria-haspopup="dialog" data-testid="rewind-share-poster" onClick={onShare} icon={<Icon icon={Share} />}>
          Share the poster
        </Button>
      ) : (
        <Button variant="ink-outline" size="pill" aria-haspopup="dialog" data-testid="rewind-share-slide" onClick={onShare} icon={<Icon icon={Share} />}>
          Share this page
        </Button>
      )}
      {canGoForward && (
        <Button variant="ink-outline" size="pill" className={reveal} data-testid="rewind-next" onClick={onNext} icon={<Icon icon={ChevronRight} />}>
          Next page
        </Button>
      )}
    </div>
  )
}
