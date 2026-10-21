import { GALLERY_VIEWPORTS, frameName, pageFrameUrl, previewCardUrl, type GalleryView } from "@/lib/rewind/gallery/review"
import { cn } from "@/lib/utils"

interface GalleryPage {
  type: string
  folio: number
  name: string
}

interface GallerySheetProps {
  previewId: string
  fixture: string
  pages: readonly GalleryPage[]
  cards: readonly string[]
  view: GalleryView
}

/** Frames are drawn at full size and scaled down: half for the phone, a quarter for the spread. */
const FRAME = {
  phone: { box: "h-[422px] w-[195px]", scale: "scale-50" },
  spread: { box: "h-[225px] w-[360px]", scale: "scale-25" },
} as const

/**
 * One review fixture's dry run (P7.11): every page the stage shows as a lazy
 * iframe of the story opened on that page and settled, then every card as
 * an image from the preview card route. `data-*` attributes carry what the
 * headless `npm run rewind:gallery` reads.
 */
export function GallerySheet({ previewId, fixture, pages, cards, view }: GallerySheetProps) {
  const size = GALLERY_VIEWPORTS[view]
  return (
    <div className="flex flex-col gap-8" data-testid="rewind-gallery-ready" data-fixture={fixture} data-preview-id={previewId}>
      <section aria-labelledby="rewind-gallery-pages" className="flex flex-col gap-3">
        <h2 id="rewind-gallery-pages" className="text-h3 font-semibold text-foreground">
          Pages ({pages.length})
        </h2>
        <ol className="flex flex-wrap gap-4">
          {pages.map((page) => (
            <li key={page.folio} className="flex flex-col gap-1.5" data-testid="rewind-gallery-page" data-page={page.type} data-folio={page.folio}>
              <div className={cn("overflow-hidden rounded-md border border-border bg-muted", FRAME[view].box)}>
                <iframe
                  src={pageFrameUrl(previewId, page.type)}
                  title={`${frameName(page.folio, page.type)}: ${page.name}`}
                  width={size.width}
                  height={size.height}
                  loading="lazy"
                  className={cn("max-w-none origin-top-left border-0", FRAME[view].scale)}
                />
              </div>
              <span className="text-label text-muted-foreground">
                {page.folio}. {page.name}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="rewind-gallery-cards" className="flex flex-col gap-3">
        <h2 id="rewind-gallery-cards" className="text-h3 font-semibold text-foreground">
          Cards ({cards.length})
        </h2>
        <ul className="flex flex-wrap gap-4">
          {cards.map((card) => (
            <li key={card} className="flex flex-col gap-1.5" data-testid="rewind-gallery-card" data-page={card}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the card route returns a finished PNG; next/image would re-encode it */}
              <img
                src={previewCardUrl(previewId, card)}
                alt={`The ${card} card`}
                width={180}
                height={320}
                loading="lazy"
                className="h-80 w-45 rounded-md border border-border bg-muted object-contain"
              />
              <span className="text-label text-muted-foreground">{card}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
