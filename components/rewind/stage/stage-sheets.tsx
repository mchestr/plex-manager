"use client"

import type { Route } from "next"

import { ArticleOfferSheet } from "@/components/rewind/sheets/article-offer-sheet"
import { SettingsSheet } from "@/components/rewind/sheets/settings-sheet"
import { TableSheet } from "@/components/rewind/sheets/table-sheet"
import { aboutTheWords, type CopyAuthor } from "@/lib/rewind/copy-disclosure"
import type { PageTable } from "@/lib/rewind/registry"
import type { SheetName } from "@/lib/rewind/stage/player-reducer"
import type { StagePrefs } from "@/lib/rewind/stage/prefs"

import { updateRewindPrefs } from "./use-rewind-prefs"

/** The sheet the stage opens on load when the screen is small for the story. */
export const ARTICLE_OFFER: SheetName = "article-offer"

interface StageSheetsProps {
  /** The open sheet from the player state, or null. */
  sheet: SheetName | null
  onClose: () => void
  pageName: string
  table: PageTable | null
  prefs: StagePrefs
  articleHref: Route
  copy: CopyAuthor
}

/**
 * The story's sheets (Rewind design 4.6, 4.7): Settings, the current page's
 * Table and the article-mode offer. Each is controlled by the player's
 * `sheet`, so opening one pauses through `OPEN_SHEET` and closing one sends
 * `CLOSE_SHEET`, which resumes only if the story was playing. They portal
 * through the scope's container and print on paper. P5.11 adds Share.
 */
export function StageSheets({ sheet, onClose, pageName, table, prefs, articleHref, copy }: StageSheetsProps) {
  return (
    <>
      <SettingsSheet
        open={sheet === "settings"}
        onClose={onClose}
        prefs={prefs}
        onChange={updateRewindPrefs}
        articleHref={articleHref}
        aboutTheWords={aboutTheWords(copy)}
      />
      {table && <TableSheet open={sheet === "table"} onClose={onClose} pageName={pageName} table={table} />}
      <ArticleOfferSheet
        open={sheet === ARTICLE_OFFER}
        articleHref={articleHref}
        onChoose={(choice) => {
          updateRewindPrefs({ smallScreenChoice: choice })
          onClose()
        }}
      />
    </>
  )
}
