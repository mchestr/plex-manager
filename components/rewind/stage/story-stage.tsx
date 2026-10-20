"use client"

import type { Route } from "next"
import { useRouter } from "next/navigation"
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"

import { inkProps } from "@/lib/design/tokens"
import { registry, type IssuePageType } from "@/lib/rewind/registry"
import { keyToCommand, type StageCommand } from "@/lib/rewind/stage/keymap"
import { pageInk } from "@/lib/rewind/stage/page-ink"
import { pageKind } from "@/lib/rewind/stage/player-reducer"
import { cn } from "@/lib/utils"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

import { ChromeBottom } from "./chrome-bottom"
import { ChromeTop } from "./chrome-top"
import { PlayerProvider } from "./player-context"
import { Progress } from "./progress"
import { useSetStageInk } from "./stage-ink"
import { StagePage } from "./stage-page"
import { useFitStage } from "./use-fit-stage"
import { useStageGestures } from "./use-stage-gestures"
import { DEFAULT_STAGE_PREFS, useStoryPlayer, type StagePrefs } from "./use-story-player"

/** @public P5.1 builds the page list. */
export interface StoryStagePage {
  type: IssuePageType
  /** The page body: a Server Component, typeset on the server. */
  content: ReactNode
}

interface StoryStageProps {
  pages: readonly StoryStagePage[]
  archetype: ArchetypeId | null
  /** Where Close, Esc and a swipe down go: P5.1's `safeReturnPath(from)`. */
  closeHref: Route
  /** P5.3 passes the stored per-device preferences. */
  prefs?: StagePrefs
}

/** Before the first fit: the 390 x 844 roomy layout at scale 1. */
const FIT_DEFAULTS = { "--u": 1, "--rw-artboard-h": 693, "--rw-chrome-top": "76px", "--rw-chrome-bottom": "75px" } as CSSProperties

/**
 * The story player (Rewind design 4.6 and 4.7): a fixed 9:16 artboard that
 * never scrolls, with tap, swipe, hold and keyboard input, autoplay that
 * survives member turns, and a visible Pause. Progress is CSS, so a dwell
 * costs no React render.
 *
 * Layers, bottom to top: the pages (`StagePage`, with the gesture handlers),
 * then the top and bottom chrome in the current page's ink. P5.3 adds the
 * sheets, focus handling and live region here, P5.6 the match-cut layer and
 * P5.11 the share sheet.
 */
export function StoryStage({ pages, archetype, closeHref, prefs = DEFAULT_STAGE_PREFS }: StoryStageProps) {
  const router = useRouter()
  const root = useRef<HTMLElement>(null)
  const safeArea = useRef<HTMLDivElement>(null)
  const fit = useFitStage(root, safeArea)
  const entries = pages.map((page) => registry[page.type])
  const { state, send } = useStoryPlayer(
    entries.map((entry) => pageKind(entry.dwell)),
    prefs
  )
  const setStageInk = useSetStageInk()

  const entry = entries[state.index]
  const ink = pageInk(entry, archetype)
  const last = pages.length - 1
  const playing = state.mode === "playing" || (["holding", "interacting", "sheet"].includes(state.mode) && state.resumeTo === "playing")

  // Registry entries are module constants, so the ink changes only with the page.
  useEffect(() => {
    setStageInk(pageInk(entry, archetype))
  }, [setStageInk, entry, archetype])

  useEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [])

  const close = () => router.push(closeHref)
  const forward = () => send(state.mode === "cover" ? { type: "CHOOSE_CUT" } : { type: "NEXT", source: "button" })

  const gestures = useStageGestures({
    onGesture: (gesture) => {
      if (gesture.kind === "close") return close()
      const source = gesture.kind
      if (gesture.direction === "back") send({ type: "PREV", source })
      else send(state.mode === "cover" ? { type: "CHOOSE_CUT" } : { type: "NEXT", source })
    },
    onHoldStart: () => send({ type: "HOLD_START" }),
    onHoldEnd: () => send({ type: "HOLD_END" }),
  })

  const run = (command: StageCommand) => {
    switch (command) {
      case "next":
        return send(state.mode === "cover" ? { type: "CHOOSE_CUT" } : { type: "NEXT", source: "key" })
      case "prev":
        return send({ type: "PREV", source: "key" })
      case "first":
        return send({ type: "GOTO", index: 0, source: "key" })
      case "last":
        return send({ type: "GOTO", index: last, source: "key" })
      case "toggle-play":
        if (state.mode === "cover" || state.mode === "ended") return
        return send({ type: playing ? "PAUSE" : "PLAY" })
      case "escape":
        return state.mode === "sheet" ? send({ type: "CLOSE_SHEET" }) : close()
      case "table":
        return entry.table ? send({ type: "OPEN_SHEET", sheet: "table" }) : undefined
      case "share":
      case "settings":
        return send({ type: "OPEN_SHEET", sheet: command })
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const command = keyToCommand(event, { shortcuts: prefs.shortcuts })
    if (!command) return
    event.preventDefault()
    run(command)
  }

  const chromeInk = inkProps(ink.ink, ink.opts)
  const chromeHidden = state.mode === "holding"

  return (
    <PlayerProvider value={send}>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- the stage region takes the story keys while focus is inside it (design 4.6); P5.3 labels it */}
      <section
        ref={root}
        tabIndex={-1}
        data-testid="rewind-stage"
        data-mode={state.mode}
        data-chrome={fit.chrome}
        style={FIT_DEFAULTS}
        onKeyDown={onKeyDown}
        className="fixed inset-0 overflow-hidden overscroll-none outline-none"
      >
        <div aria-hidden ref={safeArea} className="pointer-events-none invisible absolute pb-[env(safe-area-inset-bottom)]" />
        <div className="absolute inset-0 touch-pinch-zoom select-none" data-testid="rewind-pages" {...gestures}>
          {pages.map((page, i) => (
            <StagePage key={i} index={i} current={state.index} previous={state.prevIndex} ink={pageInk(entries[i], archetype)}>
              {page.content}
            </StagePage>
          ))}
        </div>
        <header
          {...chromeInk}
          data-testid="rewind-chrome-top"
          className={cn(chromeInk.className, "absolute inset-x-0 top-0 z-10 h-(--rw-chrome-top) text-foreground transition-opacity duration-(--rw-dur-s)", chromeHidden && "pointer-events-none opacity-0")}
        >
          <ChromeTop
            compact={fit.chrome === "compact"}
            progress={
              <Progress
                dwells={entries.map((e) => (typeof e.dwell === "number" ? e.dwell : null))}
                index={state.index}
                playing={state.mode === "playing"}
                slowerPacing={prefs.slowerPacing}
                onDwellEnd={() => send({ type: "DWELL_END" })}
              />
            }
            page={state.index + 1}
            pageCount={pages.length}
            pageName={entry.name}
            showPause={state.mode !== "cover" && state.mode !== "ended"}
            playing={playing}
            closeHref={closeHref}
            onSettings={() => send({ type: "OPEN_SHEET", sheet: "settings" })}
            onTogglePlay={() => send({ type: playing ? "PAUSE" : "PLAY" })}
          />
        </header>
        <footer
          {...chromeInk}
          data-testid="rewind-chrome-bottom"
          className={cn(chromeInk.className, "absolute inset-x-0 bottom-0 z-10 flex h-(--rw-chrome-bottom) items-center justify-center pb-[env(safe-area-inset-bottom)] text-foreground transition-opacity duration-(--rw-dur-s)", chromeHidden && "pointer-events-none opacity-0")}
        >
          <ChromeBottom
            hasTable={entry.table !== undefined}
            poster={entry.type === "centrefold"}
            canGoBack={state.index > 0}
            canGoForward={state.index < last}
            onTable={() => send({ type: "OPEN_SHEET", sheet: "table" })}
            onShare={() => send({ type: "OPEN_SHEET", sheet: "share" })}
            onPrev={() => send({ type: "PREV", source: "button" })}
            onNext={forward}
          />
        </footer>
      </section>
    </PlayerProvider>
  )
}
