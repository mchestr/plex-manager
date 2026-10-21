"use client"

import type { Route } from "next"
import type { ReactNode } from "react"

import { inkProps } from "@/lib/design/tokens"
import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import { shareFormats } from "@/lib/rewind/page-meta"
import type { PageTable, RewindPageType } from "@/lib/rewind/registry"
import type { ActGroup } from "@/lib/rewind/stage/acts"
import { cn } from "@/lib/utils"

import { ContentsRail } from "./contents-rail"
import { SPREAD_BOX } from "./geometry"
import { NotesColumn } from "./notes-column"
import { SpreadNav } from "./spread-nav"
import { SpreadTopBar } from "./spread-top-bar"

interface SpreadChromeProps {
  serverName?: string
  year: number
  types: readonly RewindPageType[]
  names: readonly string[]
  groups: readonly ActGroup[]
  index: number
  progress: ReactNode
  showPause: boolean
  playing: boolean
  /** Sharing is offered (not in preview mode). */
  share: boolean
  closeHref: Route
  notes: readonly ArticleBlock[]
  /** The Notes once the quiz is answered or skipped, when they differ (P8.4). */
  answeredNotes?: readonly ArticleBlock[] | null
  table: PageTable | null
  showTable: boolean
  onToggleTable: () => void
  onGoto: (index: number) => void
  onPrev: () => void
  onNext: () => void
  onTogglePlay: () => void
  onShare: () => void
  onSettings: () => void
}

const pad = (n: number) => String(n).padStart(2, "0")

/** The crop marks: a short tick beyond each corner, along both edges. */
const TICKS = [
  "top-0 -left-6 h-px w-4", "top-0 -right-6 h-px w-4", "bottom-0 -left-6 h-px w-4", "bottom-0 -right-6 h-px w-4",
  "-top-6 left-0 h-4 w-px", "-top-6 right-0 h-4 w-px", "-bottom-6 left-0 h-4 w-px", "-bottom-6 right-0 h-4 w-px",
]

/**
 * The desktop spread's chrome (Rewind design 4.7, P7.4), printed on paper
 * around the stage's own pages: the top bar, the contents rail, the framed
 * artboard's crop marks with the previous and next buttons, and the Notes.
 * It shows only under the `rw-spread:` query, while the phone chrome hides
 * there, so the switch is CSS only and both render on the server. The layer
 * lets pointer events through to the pages except on its own controls.
 */
export function SpreadChrome(props: SpreadChromeProps) {
  const { types, names, groups, index, onGoto, onPrev, onNext } = props
  const paper = inkProps("paper")
  const label = (i: number) => `${pad(i + 1)} ${names[i]}`
  const type = types[index]

  return (
    <div
      {...paper}
      data-testid="rewind-spread"
      className={cn(paper.className, "pointer-events-none absolute inset-0 z-10 hidden bg-transparent text-foreground rw-spread:block")}
    >
      <SpreadTopBar
        serverName={props.serverName}
        year={props.year}
        groups={groups}
        index={index}
        onGoto={onGoto}
        progress={props.progress}
        showPause={props.showPause}
        playing={props.playing}
        onTogglePlay={props.onTogglePlay}
        share={props.share && type !== "back-cover"}
        onShare={props.onShare}
        onSettings={props.onSettings}
        closeHref={props.closeHref}
      />
      <ContentsRail groups={groups} names={names} index={index} onGoto={onGoto} />
      <div className={cn(SPREAD_BOX, "outline-[1.5px] outline-current outline-solid")} data-testid="rewind-spread-frame">
        {TICKS.map((tick) => (
          <span key={tick} aria-hidden className={cn("absolute bg-current", tick)} />
        ))}
        <SpreadNav prev={index > 0 ? label(index - 1) : null} next={index < types.length - 1 ? label(index + 1) : null} onPrev={onPrev} onNext={onNext} />
      </div>
      <NotesColumn
        folio={pad(index + 1)}
        pageName={names[index]}
        notes={props.notes}
        answeredNotes={props.answeredNotes}
        table={props.table}
        showTable={props.showTable}
        onToggleTable={props.onToggleTable}
        formats={props.share ? shareFormats(type) : null}
      />
    </div>
  )
}
