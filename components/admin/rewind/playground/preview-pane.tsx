"use client"

import { Play } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Icon } from "@/components/ui/icon"
import { previewCardUrl } from "@/lib/rewind/gallery/review"

interface PreviewPaneProps {
  previewId: string
  year: number
  /** The share cards this run's pages project, by page type. */
  cards: readonly string[]
}

/**
 * The story preview (P7.10's `/rewind/{year}?preview=<id>`) in a Dialog, and
 * this run's cards from the preview card route. Nothing is stored, and the
 * preview expires with the run after an hour.
 */
export function PreviewPane({ previewId, year, cards }: PreviewPaneProps) {
  return (
    <section aria-labelledby="playground-preview" className="flex flex-col gap-4" data-testid="playground-preview">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="playground-preview" className="text-h3 font-semibold text-foreground">
          Preview
        </h2>
        <Dialog>
          <DialogTrigger render={<Button variant="secondary" data-testid="playground-preview-open" />}>
            <Icon icon={Play} />
            Open the story
          </DialogTrigger>
          <DialogContent size="form" data-testid="playground-preview-dialog">
            <DialogHeader>
              <DialogTitle>Story preview</DialogTitle>
              <DialogDescription>The run as a member would read it. Nothing is stored.</DialogDescription>
            </DialogHeader>
            <iframe
              src={`/rewind/${year}?preview=${previewId}`}
              title="Story preview"
              className="h-[70dvh] w-full rounded-md border border-border bg-background"
              data-testid="playground-preview-frame"
            />
          </DialogContent>
        </Dialog>
      </div>
      {cards.length > 0 ? (
        <ul className="flex flex-wrap gap-4">
          {cards.map((card) => (
            <li key={card} className="flex flex-col gap-1.5" data-testid="playground-card" data-page={card}>
              {/* eslint-disable-next-line @next/next/no-img-element -- the card route returns a finished PNG; next/image would re-encode it */}
              <img
                src={previewCardUrl(previewId, card)}
                alt={`The ${card} card`}
                width={135}
                height={240}
                loading="lazy"
                className="h-60 w-34 rounded-md border border-border bg-muted object-contain"
              />
              <span className="text-label text-muted-foreground">{card}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ui text-muted-foreground">This run has no shareable cards.</p>
      )}
    </section>
  )
}
