import Link from "next/link"
import type { ReactNode } from "react"

import { eligibleCards } from "@/lib/rewind/cards/eligible"
import { shareAlt } from "@/lib/rewind/registry"
import type { ShareSafeRewindV3 } from "@/lib/wrapped/data/share-safe-schema"

/** "Chester Family Plex Rewind 2026", or "Rewind 2026" without a brand. */
export function shareMasthead(share: Pick<ShareSafeRewindV3, "brand" | "year">): string {
  return share.brand ? `${share.brand} Rewind ${share.year}` : `Rewind ${share.year}`
}

/** "Shared by Mike" only when signed, else the server or the issue (design 6.6). */
function sharedBy(share: Pick<ShareSafeRewindV3, "ownerName" | "brand" | "year">): string {
  if (share.ownerName) return `Shared by ${share.ownerName}`
  return share.brand ? `Shared by a member of ${share.brand}` : `Shared from Rewind ${share.year}`
}

interface SharedRewindProps {
  share: ShareSafeRewindV3
  assetKey: string
  /** A signed-in viewer gets "Open your own Rewind". */
  signedIn: boolean
  /** The owner's banner, when the owner is viewing. */
  banner?: ReactNode
}

/** The story card's size (`CARD_SIZES.story`), so the row reserves its space before the PNG arrives. */
const STORY = { width: 1080, height: 1920 } as const

/**
 * A v3 share link's page (design 6.6): the masthead, the published cards as
 * images from the asset-key route (a snap-scroll row on phones, three across
 * from `lg`) with alt text from the projection alone, and who shared it. It
 * reads nothing but the projection, so it shows no more than the cards do.
 */
export function SharedRewind({ share, assetKey, signedIn, banner }: SharedRewindProps) {
  // Only pages with a card under the link's own options (the calendar needs its days).
  const carded = new Set(eligibleCards(share, { dailyDetail: true }))
  const pages = share.pages.filter((page) => carded.has(page.type))

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {banner}
      <header className="flex flex-col gap-1 border-b-[3px] border-current pb-3">
        <h1 className="font-display text-h1" data-testid="rewind-share-masthead">
          {shareMasthead(share)}
        </h1>
        <p className="font-text text-body" data-testid="rewind-share-byline">
          {sharedBy(share)}
        </p>
      </header>
      <ul
        aria-label="Shared cards"
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0"
        data-testid="rewind-share-cards"
      >
        {pages.map((page, i) => (
          <li key={page.type} className="w-[78%] max-w-sm shrink-0 snap-center lg:w-auto lg:max-w-none" data-testid={`rewind-share-card-${page.type}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a PNG the card route already sized; no optimizer (SEC-01) */}
            <img
              src={`/api/rewind/card/s/${encodeURIComponent(assetKey)}/${page.type}`}
              width={STORY.width}
              height={STORY.height}
              alt={shareAlt(page)}
              loading={i < 3 ? "eager" : "lazy"}
              className="h-auto w-full rounded-md border border-current"
            />
          </li>
        ))}
      </ul>
      {signedIn ? (
        <p>
          <Link href="/rewind" className="font-display text-ui underline underline-offset-4" data-testid="rewind-share-open-own">
            Open your own Rewind
          </Link>
        </p>
      ) : null}
    </div>
  )
}
