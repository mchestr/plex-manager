"use client"

import { domAnimation, LazyMotion, MotionConfig } from "motion/react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"

import { shouldOfferArticle } from "@/components/rewind/sheets/article-offer-sheet"
import { Button } from "@/components/ui/button"
import { inkProps } from "@/lib/design/tokens"
import type { CopyAuthor } from "@/lib/rewind/copy-disclosure"
import { registry, type IssuePageType, type PageTable } from "@/lib/rewind/registry"
import { keyToCommand, type StageCommand } from "@/lib/rewind/stage/keymap"
import { pageInk } from "@/lib/rewind/stage/page-ink"
import { pageKind } from "@/lib/rewind/stage/player-reducer"
import { readPrefs } from "@/lib/rewind/stage/prefs"
import { cn } from "@/lib/utils"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

import { ChromeBottom } from "./chrome-bottom"
import { ChromeTop } from "./chrome-top"
import { PlayerProvider } from "./player-context"
import { Progress } from "./progress"
import { useSetStageArchetype, useSetStageInk } from "./stage-ink"
import { StagePage } from "./stage-page"
import { ARTICLE_OFFER, StageSheets } from "./stage-sheets"
import { useFitStage } from "./use-fit-stage"
import { useRewindPrefs } from "./use-rewind-prefs"
import { useStageA11y } from "./use-stage-a11y"
import { useStageGestures } from "./use-stage-gestures"
import { useStoryPlayer } from "./use-story-player"

/** @public P5.1 builds the page list. */
export interface StoryStagePage {
  type: IssuePageType
  /** The page body: a Server Component, typeset on the server, with the page's `h2`. */
  content: ReactNode
  /** The registry's `table(data)` for a chart page, built on the server; the Table control shows only when it is set. */
  table?: PageTable | null
}

interface StoryStageProps {
  pages: readonly StoryStagePage[]
  year: number
  archetype: ArchetypeId | null
  /** Where Close, Esc and a swipe down go: P5.1's `safeReturnPath(from)`. */
  closeHref: Route
  /** The stored `copySource` and `copyMeta.model`, for "About the words" in Settings. */
  copy: CopyAuthor
}

/** Before the first fit: the 390 x 844 roomy layout at scale 1. */
const FIT_DEFAULTS = { "--u": 1, "--rw-artboard-h": 693, "--rw-chrome-top": "76px", "--rw-chrome-bottom": "75px" } as CSSProperties

/**
 * The story player (Rewind design 4.6, 4.7 and 11.1): a fixed 9:16 artboard
 * that never scrolls, with tap, swipe, hold and keyboard input, autoplay that
 * survives member turns, and a visible Pause. Progress is CSS, so a dwell
 * costs no React render.
 *
 * The stage is a region labelled "Rewind {year}" whose first focusable
 * element is "Read as an article". Layers, bottom to top: the pages
 * (`StagePage`, with the gesture and focus handlers), the top and bottom
 * chrome in the current page's ink, the polite live region and the sheets.
 * Motion inside follows the member's reduced-motion setting. P5.6 adds the
 * match-cut layer and P5.11 the share sheet.
 */
export function StoryStage({ pages, year, archetype, closeHref, copy }: StoryStageProps) {
  const router = useRouter()
  const root = useRef<HTMLElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const safeArea = useRef<HTMLDivElement>(null)
  const offered = useRef(false)
  const fit = useFitStage(root, safeArea)
  const prefs = useRewindPrefs()
  const entries = pages.map((page) => registry[page.type])
  const { state, send } = useStoryPlayer(
    entries.map((entry) => pageKind(entry.dwell)),
    prefs.autoplay
  )
  const setStageInk = useSetStageInk()
  const setStageArchetype = useSetStageArchetype()

  const entry = entries[state.index]
  const table = pages[state.index].table ?? null
  const ink = pageInk(entry, archetype)
  const last = pages.length - 1
  const playing = state.mode === "playing" || (["holding", "interacting", "sheet"].includes(state.mode) && state.resumeTo === "playing")
  const articleHref = `/rewind/${year}/read` as Route
  const pageLabel = (i: number) => `Page ${i + 1} of ${pages.length}: ${entries[i].name}`
  const { announcement, focusHandlers } = useStageA11y({ pagesRef, state, send, pageLabel })

  // Registry entries are module constants, so the ink changes only with the page.
  useEffect(() => {
    setStageInk(pageInk(entry, archetype))
  }, [setStageInk, entry, archetype])

  useEffect(() => {
    setStageArchetype(archetype)
    return () => setStageArchetype(null)
  }, [setStageArchetype, archetype])

  useEffect(() => {
    root.current?.focus({ preventScroll: true })
  }, [])

  // Offer article mode once, on load, below the scale floor or at large text sizes.
  useEffect(() => {
    if (offered.current || !shouldOfferArticle(fit, readPrefs().smallScreenChoice)) return
    offered.current = true
    send({ type: "OPEN_SHEET", sheet: ARTICLE_OFFER })
  }, [fit, send])

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
      case "choose":
        return state.mode === "cover" ? send({ type: "CHOOSE_CUT" }) : undefined
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
        return table ? send({ type: "OPEN_SHEET", sheet: "table" }) : undefined
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
    <PlayerProvider value={send} sheet={state.mode === "sheet" ? state.sheet : null}>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the labelled stage region takes the story keys while focus is inside it (design 4.6) */}
          <section
            ref={root}
            tabIndex={-1}
            aria-label={`Rewind ${year}`}
            data-testid="rewind-stage"
            data-mode={state.mode}
            data-chrome={fit.chrome}
            style={FIT_DEFAULTS}
            onKeyDown={onKeyDown}
            className="fixed inset-0 overflow-hidden overscroll-none outline-none"
          >
            <Button
              {...chromeInk}
              variant="ink"
              size="pill"
              nativeButton={false}
              render={<Link href={articleHref} />}
              data-testid="rewind-article-mode"
              className={cn(chromeInk.className, "sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-3 focus-visible:z-20")}
            >
              Read as an article
            </Button>
            <div aria-hidden ref={safeArea} className="pointer-events-none invisible absolute pb-[env(safe-area-inset-bottom)]" />
            <div ref={pagesRef} className="absolute inset-0 touch-pinch-zoom select-none" data-testid="rewind-pages" {...gestures} {...focusHandlers}>
              {pages.map((page, i) => (
                <StagePage key={i} index={i} current={state.index} previous={state.prevIndex} ink={pageInk(entries[i], archetype)} label={pageLabel(i)}>
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
                hasTable={table !== null}
                poster={entry.type === "centrefold"}
                share={entry.type !== "back-cover"}
                canGoBack={state.index > 0}
                canGoForward={state.index < last}
                onTable={() => send({ type: "OPEN_SHEET", sheet: "table" })}
                onShare={() => send({ type: "OPEN_SHEET", sheet: "share" })}
                onPrev={() => send({ type: "PREV", source: "button" })}
                onNext={forward}
              />
            </footer>
            <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="rewind-live">
              {announcement}
            </div>
            <StageSheets
              sheet={state.mode === "sheet" ? state.sheet : null}
              onClose={() => send({ type: "CLOSE_SHEET" })}
              pageName={entry.name}
              table={table}
              prefs={prefs}
              articleHref={articleHref}
              copy={copy}
            />
          </section>
        </MotionConfig>
      </LazyMotion>
    </PlayerProvider>
  )
}
