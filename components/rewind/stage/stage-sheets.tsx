"use client"

import type { Route } from "next"

import { ArticleOfferSheet } from "@/components/rewind/sheets/article-offer-sheet"
import { ShareSheet } from "@/components/rewind/share/share-sheet"
import { SettingsSheet } from "@/components/rewind/sheets/settings-sheet"
import { TableSheet } from "@/components/rewind/sheets/table-sheet"
import { aboutTheWords, type CopyAuthor } from "@/lib/rewind/copy-disclosure"
import type { RewindPageType, PageTable } from "@/lib/rewind/registry"
import { SHARE_SETTINGS_SHEET } from "@/lib/rewind/share-sheet"
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
  /** The current page, where the share sheet's picker starts. */
  page: RewindPageType
  table: PageTable | null
  prefs: StagePrefs
  articleHref: Route
  copy: CopyAuthor
  /** The previews' share sheet: the viewer's own Rewind, when the preview shows it. */
  ownRewindHref?: Route
}

/**
 * The story's sheets (Rewind design 4.6, 4.7): Settings, the current page's
 * Table and the article-mode offer. Each is controlled by the player's
 * `sheet`, so opening one pauses through `OPEN_SHEET` and closing one sends
 * `CLOSE_SHEET`, which resumes only if the story was playing. They portal
 * through the scope's container and print on paper. Share (P5.11) opens from
 * S, the share buttons and `?sheet=share`, and from the back cover's
 * "Change" at its switches; outside a `ShareProvider` (the previews) it
 * says that sharing is off there and where it happens.
 */
export function StageSheets({ sheet, onClose, pageName, page, table, prefs, articleHref, copy, ownRewindHref }: StageSheetsProps) {
  return (
    <>
      <ShareSheet
        open={sheet === "share" || sheet === SHARE_SETTINGS_SHEET}
        onClose={onClose}
        page={page}
        atSettings={sheet === SHARE_SETTINGS_SHEET}
        ownRewindHref={ownRewindHref}
      />
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
