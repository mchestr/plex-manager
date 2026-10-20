"use client"

import type { Route } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

interface ArticleOfferSheetProps {
  open: boolean
  articleHref: Route
  onChoose: (choice: "article" | "story") => void
}

/** Whether to offer article mode on load: the fit is under the floor or the text is large, and no choice is stored. */
export function shouldOfferArticle(fit: { belowFloor: boolean; largeText: boolean }, choice: "article" | "story" | null): boolean {
  return (fit.belowFloor || fit.largeText) && choice === null
}

/**
 * Offered on load when the story would scale under 0.8 or the text size is
 * above 130% (Rewind design 4.7, 11.1): article mode is the conforming
 * alternative, so "Read as an article" comes first. The choice is stored per
 * device, and closing the sheet plays the story.
 */
export function ArticleOfferSheet({ open, articleHref, onChoose }: ArticleOfferSheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onChoose("story")}>
      <SheetContent side="bottom" grabber data-testid="rewind-article-offer" className="font-display">
        <SheetHeader>
          <SheetTitle>This screen is small for the story layout</SheetTitle>
          <SheetDescription>The article has every page, with text that reflows to your screen and text size.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3">
          <Button
            variant="ink"
            size="pill"
            nativeButton={false}
            render={<Link href={articleHref} />}
            onClick={() => onChoose("article")}
            data-testid="rewind-article-offer-read"
          >
            Read as an article
          </Button>
          <Button variant="ink-outline" size="pill" onClick={() => onChoose("story")} data-testid="rewind-article-offer-story">
            Play the story anyway
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
