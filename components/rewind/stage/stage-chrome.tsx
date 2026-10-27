"use client"

import type { Route } from "next"

import { SpreadChrome } from "@/components/rewind/desktop/spread-chrome"
import type { InkProps } from "@/lib/design/tokens"
import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import { pageMeta, REVEAL_DWELL_MS, type PageMeta } from "@/lib/rewind/page-meta"
import type { PageTable } from "@/lib/rewind/registry"
import { actGroups } from "@/lib/rewind/stage/acts"
import type { PlayerEvent, PlayerState } from "@/lib/rewind/stage/player-reducer"
import { cn } from "@/lib/utils"

import { ChromeBottom } from "./chrome-bottom"
import { ChromeTop } from "./chrome-top"
import { Progress } from "./progress"

interface StageChromeProps {
  /** The current page's ink for the chrome. */
  ink: InkProps
  /** Hidden while a hold pauses the story. */
  hidden: boolean
  compact: boolean
  entries: readonly PageMeta[]
  state: PlayerState
  send: (event: PlayerEvent) => void
  playing: boolean
  slowerPacing: boolean
  table: PageTable | null
  notes: readonly ArticleBlock[]
  answeredNotes?: readonly ArticleBlock[] | null
  /** The spread's Notes show the page's table instead. */
  showTable: boolean
  onToggleTable: () => void
  /** Share controls: off in both previews. */
  share: boolean
  serverName?: string
  year: number
  closeHref: Route
  /** The top bar's Full screen control, or null where it is not offered. */
  fullscreen: { active: boolean; onToggle: () => void } | null
  onNext: () => void
}

/**
 * The stage's chrome: the story's top and bottom bars in the current page's
 * ink, and the desktop spread's rail and Notes (P7.4), which the spread query
 * shows instead of the bars.
 */
export function StageChrome({
  ink,
  hidden,
  compact,
  entries,
  state,
  send,
  playing,
  slowerPacing,
  table,
  notes,
  answeredNotes,
  showTable,
  onToggleTable,
  share,
  serverName,
  year,
  closeHref,
  fullscreen,
  onNext,
}: StageChromeProps) {
  const entry = entries[state.index]
  const last = entries.length - 1
  const dwells = entries.map((e) => (typeof e.dwell === "number" ? e.dwell : e.dwell === "hold" ? REVEAL_DWELL_MS : null))
  const types = entries.map((e) => e.type)
  const groups = actGroups(types)

  return (
    <>
      <header
        {...ink}
        data-testid="rewind-chrome-top"
        className={cn(ink.className, "absolute inset-x-0 top-0 z-10 h-(--rw-chrome-top) text-foreground **:transition-none transition-opacity duration-(--rw-dur-s) rw-spread:hidden", hidden && "pointer-events-none opacity-0")}
      >
        <ChromeTop
          compact={compact}
          progress={
            <Progress
              dwells={dwells}
              index={state.index}
              playing={state.mode === "playing"}
              slowerPacing={slowerPacing}
              onDwellEnd={() => send({ type: "DWELL_END" })}
            />
          }
          page={state.index + 1}
          pageCount={entries.length}
          pageName={entry.name}
          showPause={state.mode !== "cover" && state.mode !== "ended"}
          playing={playing}
          closeHref={closeHref}
          fullscreen={fullscreen}
          onSettings={() => send({ type: "OPEN_SHEET", sheet: "settings" })}
          onTogglePlay={() => send({ type: playing ? "PAUSE" : "PLAY" })}
        />
      </header>
      <footer
        {...ink}
        data-testid="rewind-chrome-bottom"
        className={cn(ink.className, "absolute inset-x-0 bottom-0 z-10 flex h-(--rw-chrome-bottom) items-center justify-center pb-[env(safe-area-inset-bottom)] text-foreground **:transition-none transition-opacity duration-(--rw-dur-s) rw-spread:hidden", hidden && "pointer-events-none opacity-0")}
      >
        <ChromeBottom
          hasTable={table !== null}
          poster={entry.type === "centrefold"}
          share={share && entry.type !== "back-cover"}
          canGoBack={state.index > 0}
          canGoForward={state.index < last}
          onTable={() => send({ type: "OPEN_SHEET", sheet: "table" })}
          onShare={() => send({ type: "OPEN_SHEET", sheet: "share" })}
          onPrev={() => send({ type: "PREV", source: "button" })}
          onNext={onNext}
        />
      </footer>
      <SpreadChrome
        serverName={serverName}
        year={year}
        types={types}
        names={entries.map((e) => e.name)}
        groups={groups}
        index={state.index}
        progress={
          <Progress
            dwells={dwells}
            index={state.index}
            playing={state.mode === "playing"}
            slowerPacing={slowerPacing}
            onDwellEnd={() => send({ type: "DWELL_END" })}
            groups={types.map((type) => groups.findIndex((group) => group.act === pageMeta[type].act))}
            testId="rewind-spread-progress"
          />
        }
        showPause={state.mode !== "cover" && state.mode !== "ended"}
        playing={playing}
        share={share}
        closeHref={closeHref}
        notes={notes}
        answeredNotes={answeredNotes}
        table={table}
        showTable={showTable}
        onToggleTable={onToggleTable}
        onGoto={(index) => send({ type: "GOTO", index, source: "button" })}
        onPrev={() => send({ type: "PREV", source: "button" })}
        onNext={onNext}
        onTogglePlay={() => send({ type: playing ? "PAUSE" : "PLAY" })}
        onShare={() => send({ type: "OPEN_SHEET", sheet: "share" })}
        onSettings={() => send({ type: "OPEN_SHEET", sheet: "settings" })}
      />
    </>
  )
}
