"use client"

import { domAnimation, LazyMotion, MotionConfig } from "motion/react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"

import { ShareProvider, type ShareActions } from "@/components/rewind/share/share-context"
import { shouldOfferArticle } from "@/components/rewind/sheets/article-offer-sheet"
import { Button } from "@/components/ui/button"
import { inkProps } from "@/lib/design/tokens"
import type { CopyAuthor } from "@/lib/rewind/copy-disclosure"
import { registry, REVEAL_DWELL_MS, type PageTable, type RewindPageType } from "@/lib/rewind/registry"
import type { ShareSetup } from "@/lib/rewind/share-sheet"
import { keyToCommand, type StageCommand } from "@/lib/rewind/stage/keymap"
import { pageInk } from "@/lib/rewind/stage/page-ink"
import { pageKind, type PlayerEvent, type SheetName } from "@/lib/rewind/stage/player-reducer"
import { readPrefs } from "@/lib/rewind/stage/prefs"
import { cn } from "@/lib/utils"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

import { ChromeBottom } from "./chrome-bottom"
import { ChromeTop } from "./chrome-top"
import { MatchCut } from "./match-cut"
import { PlayerProvider } from "./player-context"
import { Progress } from "./progress"
import { QuizProvider } from "./quiz-context"
import { useSetStageArchetype, useSetStageInk } from "./stage-ink"
import { StagePage } from "./stage-page"
import { ARTICLE_OFFER, StageSheets } from "./stage-sheets"
import { useFitStage } from "./use-fit-stage"
import { usePerfProbe } from "./use-perf-probe"
import { useRewindPrefs } from "./use-rewind-prefs"
import { useStageA11y } from "./use-stage-a11y"
import { useStageGestures } from "./use-stage-gestures"
import { useStoryCut } from "./use-story-cut"
import { useStoryPlayer } from "./use-story-player"

/** @public P5.1 builds the page list. */
export interface StoryStagePage {
  type: RewindPageType
  /** The page body: a Server Component, typeset on the server, with the page's `h2`. */
  content: ReactNode
  /** The registry's `table(data)` for a chart page, built on the server; the Table control shows only when it is set. */
  table?: PageTable | null
}

interface StoryStageProps {
  pages: readonly StoryStagePage[]
  /** The pocket cut's pages (P7.3), when a full issue offers it on the cover; the cover's choice swaps to them. */
  pocket?: readonly StoryStagePage[]
  year: number
  archetype: ArchetypeId | null
  /** Where Close, Esc and a swipe down go: P5.1's `safeReturnPath(from)`. */
  closeHref: Route
  /** The stored `copySource` and `copyMeta.model`, for "About the words" in Settings. */
  copy: CopyAuthor
  /** The share sheet's setup and actions (P5.11); without them the share controls open nothing. */
  share?: { setup: ShareSetup; actions: ShareActions }
  /** A sheet to open on load: `?sheet=share` opens Share over the cover, paused. */
  initialSheet?: SheetName
  /** `preview`: an admin's dry run (P7.10), under a Preview banner, with no sharing. */
  mode?: "member" | "preview"
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
 * (`StagePage`, with the gesture and focus handlers), the match-cut layer
 * (the quiz's chosen tile flying into page 05), the top and bottom chrome in
 * the current page's ink, the polite live region and the sheets. The quiz
 * answer lives in the stage's `QuizProvider`. Motion inside follows the
 * member's reduced-motion setting. The share sheet reads the issue's
 * `ShareProvider`, which wraps the stage when `share` is set.
 */
export function StoryStage({ share, ...props }: StoryStageProps) {
  return share ? (
    <ShareProvider setup={share.setup} actions={share.actions}>
      <Stage {...props} />
    </ShareProvider>
  ) : (
    <Stage {...props} />
  )
}

const kindsOf = (pages: readonly StoryStagePage[]) => pages.map((page) => pageKind(registry[page.type].dwell))

function Stage({ pages: fullPages, pocket, year, archetype, closeHref, copy, initialSheet, mode = "member" }: Omit<StoryStageProps, "share">) {
  const router = useRouter()
  const root = useRef<HTMLElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const safeArea = useRef<HTMLDivElement>(null)
  const offered = useRef(false)
  const fit = useFitStage(root, safeArea)
  const prefs = useRewindPrefs()
  const [cut, chooseCut] = useStoryCut(year)
  const pages = cut === "pocket" && pocket ? pocket : fullPages
  const entries = pages.map((page) => registry[page.type])
  const { state, send: sendPlayer } = useStoryPlayer(kindsOf(pages), prefs.autoplay)
  // The cover's cut (FR-4): the page list swaps while the story is still on the cover, then the story starts.
  const send = useCallback(
    (event: PlayerEvent) => {
      if (event.type === "CHOOSE_CUT" && event.cut && pocket) {
        chooseCut(event.cut)
        sendPlayer({ type: "SET_KINDS", kinds: kindsOf(event.cut === "pocket" ? pocket : fullPages) })
      }
      sendPlayer(event)
    },
    [chooseCut, sendPlayer, pocket, fullPages]
  )
  // A reload resumes the stored cut once hydration reads it.
  useEffect(() => {
    sendPlayer({ type: "SET_KINDS", kinds: kindsOf(pages) })
  }, [pages, sendPlayer])
  const setStageInk = useSetStageInk()
  const setStageArchetype = useSetStageArchetype()

  const entry = entries[state.index]
  const table = pages[state.index].table ?? null
  const ink = pageInk(entry, archetype)
  const last = pages.length - 1
  const preview = mode === "preview"
  const playing = state.mode === "playing" || (["holding", "interacting", "sheet"].includes(state.mode) && state.resumeTo === "playing")
  const articleHref = `/rewind/${year}/read` as Route
  const pageLabel = (i: number) => `Page ${i + 1} of ${pages.length}: ${entries[i].name}`
  const { announcement, focusHandlers } = useStageA11y({ pagesRef, state, send, pageLabel })
  usePerfProbe(state.index)

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

  // `?sheet=share`: the story stays paused on the cover under the sheet, so nothing past it is spoiled.
  useEffect(() => {
    if (initialSheet) send({ type: "OPEN_SHEET", sheet: initialSheet })
  }, [initialSheet, send])

  // Offer article mode once, on load, below the scale floor or at large text sizes.
  // A layout effect, so the first fitted paint (`data-fitted`) already has the sheet open.
  useLayoutEffect(() => {
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
        return preview ? undefined : send({ type: "OPEN_SHEET", sheet: command })
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
      <QuizProvider year={year}>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="user">
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the labelled stage region takes the story keys while focus is inside it (design 4.6) */}
          <section
            ref={root}
            tabIndex={-1}
            aria-label={`Rewind ${year}`}
            data-testid="rewind-stage"
            data-mode={state.mode}
            data-preview={preview || undefined}
            data-chrome={fit.chrome}
            data-fitted={fit.measured || undefined}
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
            <MatchCut pagesRef={pagesRef} types={pages.map((page) => page.type)} index={state.index} previous={state.prevIndex} />
            <header
              {...chromeInk}
              data-testid="rewind-chrome-top"
              className={cn(chromeInk.className, "absolute inset-x-0 top-0 z-10 h-(--rw-chrome-top) text-foreground transition-opacity duration-(--rw-dur-s)", chromeHidden && "pointer-events-none opacity-0")}
            >
              <ChromeTop
                compact={fit.chrome === "compact"}
                progress={
                  <Progress
                    dwells={entries.map((e) => (typeof e.dwell === "number" ? e.dwell : e.dwell === "hold" ? REVEAL_DWELL_MS : null))}
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
                share={!preview && entry.type !== "back-cover"}
                canGoBack={state.index > 0}
                canGoForward={state.index < last}
                onTable={() => send({ type: "OPEN_SHEET", sheet: "table" })}
                onShare={() => send({ type: "OPEN_SHEET", sheet: "share" })}
                onPrev={() => send({ type: "PREV", source: "button" })}
                onNext={forward}
              />
            </footer>
            {preview && (
              <p
                data-testid="rewind-preview-banner"
                className="pointer-events-none absolute inset-x-0 top-(--rw-chrome-top) z-10 mx-auto w-fit rounded-full bg-background px-3 py-1 text-sm text-foreground"
              >
                Preview
              </p>
            )}
            <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="rewind-live">
              {announcement}
            </div>
            <StageSheets
              sheet={state.mode === "sheet" ? state.sheet : null}
              onClose={() => send({ type: "CLOSE_SHEET" })}
              pageName={entry.name}
              page={entry.type}
              table={table}
              prefs={prefs}
              articleHref={articleHref}
              copy={copy}
            />
          </section>
        </MotionConfig>
      </LazyMotion>
      </QuizProvider>
    </PlayerProvider>
  )
}
