"use client"

import { MotionConfig } from "motion/react"
import type { Route } from "next"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"

import { SPREAD_PAGES } from "@/components/rewind/desktop/geometry"
import { SpreadChrome } from "@/components/rewind/desktop/spread-chrome"
import { HideProvider, type HideSetup } from "@/components/rewind/hide/hide-context"
import { ShareProvider, type ShareActions } from "@/components/rewind/share/share-context"
import { shouldOfferArticle } from "@/components/rewind/sheets/article-offer-sheet"
import { Button } from "@/components/ui/button"
import { inkProps } from "@/lib/design/tokens"
import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import type { CopyAuthor } from "@/lib/rewind/copy-disclosure"
import { pageMeta, REVEAL_DWELL_MS, type RewindPageType } from "@/lib/rewind/page-meta"
import type { PageTable } from "@/lib/rewind/registry"
import type { ShareSetup } from "@/lib/rewind/share-sheet"
import { actGroups } from "@/lib/rewind/stage/acts"
import { SPREAD_QUERY } from "@/lib/rewind/stage/fit-stage"
import { keyToCommand, type StageCommand } from "@/lib/rewind/stage/keymap"
import { pageInk } from "@/lib/rewind/stage/page-ink"
import { pageKind, type PlayerEvent, type SheetName } from "@/lib/rewind/stage/player-reducer"
import { readPrefs } from "@/lib/rewind/stage/prefs"
import { completeRunning } from "@/lib/rewind/stage/running-animations"
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
import { RecordShareProvider, useRecordView, type ViewTracking } from "./use-record-view"

/** @public P5.1 builds the page list. */
export interface StoryStagePage {
  type: RewindPageType
  /** The page body: a Server Component, typeset on the server, with the page's `h2`. */
  content: ReactNode
  /** The registry's `table(data)` for a chart page, built on the server; the Table control shows only when it is set. */
  table?: PageTable | null
  /** The desktop Notes (`pageNotes`, P7.4), built on the server. */
  notes?: readonly ArticleBlock[]
}

interface StoryStageProps {
  pages: readonly StoryStagePage[]
  /** The pocket cut's pages (P7.3), when a full issue offers it on the cover; the cover's choice swaps to them. */
  pocket?: readonly StoryStagePage[]
  year: number
  /** The server's name, for the desktop spread's brand (P7.4). */
  serverName?: string
  archetype: ArchetypeId | null
  /** Where Close, Esc and a swipe down go: P5.1's `safeReturnPath(from)`. */
  closeHref: Route
  /** The stored `copySource` and `copyMeta.model`, for "About the words" in Settings. */
  copy: CopyAuthor
  /** The share sheet's setup and actions (P5.11); without them the share controls open nothing. */
  share?: { setup: ShareSetup; actions: ShareActions }
  /** The member's hidden titles and the hide actions (P7.7); without them, and in preview mode, no Hide controls show. */
  hide?: HideSetup
  /** A sheet to open on load: `?sheet=share` opens Share over the cover, paused. */
  initialSheet?: SheetName
  /**
   * `preview`: an admin's dry run (P7.10), under a Preview banner, with no sharing.
   * `admin-preview`: a member's stored Rewind in the admin shell (P7.9), framed
   * in its parent instead of the window, with no share, hide or notify controls
   * and no `RewindView`.
   */
  mode?: "member" | "preview" | "admin-preview"
  /** Where "Read as an article" goes; the member's `/rewind/{year}/read` by default. */
  articleHref?: Route
  /** View tracking (P7.14); only the member mode records views. */
  views?: ViewTracking
  /** Preview only (P7.11's gallery): the page to open on, an index into `pages`. */
  initialIndex?: number
  /** Preview only: no autoplay and motion settled, so the page holds its reduced-motion final state. */
  still?: boolean
  /** `stage.tap-completes` (P8.3): a forward tap first lands a running count-up. */
  tapCompletes?: boolean
}

/** Before the first fit: the 390 x 844 roomy layout at scale 1, and the spread at 1440 x 900. */
const FIT_DEFAULTS = {
  "--rw-u-story": 1,
  "--rw-artboard-h-story": 693,
  "--rw-chrome-top": "76px",
  "--rw-chrome-bottom": "75px",
  "--rw-u-spread": 1.1,
  "--rw-rail-w": "245px",
  "--rw-notes-w": "432px",
} as CSSProperties

/** `--u` and the artboard height: the story's fit, or the spread's at 693 under the desktop query (CSS only, P7.4). */
const FIT_VARS =
  "[--u:var(--rw-u-story)] [--rw-artboard-h:var(--rw-artboard-h-story)] rw-spread:[--u:var(--rw-u-spread)] rw-spread:[--rw-artboard-h:693]"

const isSpread = () => typeof window.matchMedia === "function" && window.matchMedia(SPREAD_QUERY).matches

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
export function StoryStage({ share, hide, ...props }: StoryStageProps) {
  const stage = share ? (
    <ShareProvider setup={share.setup} actions={share.actions}>
      <Stage {...props} />
    </ShareProvider>
  ) : (
    <Stage {...props} />
  )
  // Hiding is a member's own action: never in preview mode.
  return hide && (props.mode ?? "member") === "member" ? (
    <HideProvider year={props.year} setup={hide}>
      {stage}
    </HideProvider>
  ) : (
    stage
  )
}

const kindsOf = (pages: readonly StoryStagePage[]) => pages.map((page) => pageKind(pageMeta[page.type].dwell))

function Stage({
  pages: fullPages,
  pocket,
  year,
  serverName,
  archetype,
  closeHref,
  copy,
  initialSheet,
  mode = "member",
  articleHref: articleHrefProp,
  views,
  initialIndex = 0,
  still = false,
  tapCompletes = false,
}: Omit<StoryStageProps, "share" | "hide">) {
  const router = useRouter()
  const root = useRef<HTMLElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const safeArea = useRef<HTMLDivElement>(null)
  const offered = useRef(false)
  const framed = mode === "admin-preview"
  const fit = useFitStage(root, safeArea, framed)
  const prefs = useRewindPrefs()
  const [cut, chooseCut] = useStoryCut(year)
  const pages = cut === "pocket" && pocket ? pocket : fullPages
  const entries = pages.map((page) => pageMeta[page.type])
  const { state, send: sendPlayer } = useStoryPlayer(kindsOf(pages), prefs.autoplay && !still)
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
  const [notesTable, setNotesTable] = useState(false)

  const entry = entries[state.index]
  const table = pages[state.index].table ?? null
  const ink = pageInk(entry, archetype)
  const last = pages.length - 1
  // Both previews: no sharing (and, from P7.7 and P7.14, no hiding and no views).
  const preview = mode !== "member"
  const playing = state.mode === "playing" || (["holding", "interacting", "sheet"].includes(state.mode) && state.resumeTo === "playing")
  const articleHref = articleHrefProp ?? (`/rewind/${year}/read` as Route)
  const pageLabel = (i: number) => `Page ${i + 1} of ${pages.length}: ${entries[i].name}`
  const { announcement, focusHandlers } = useStageA11y({ pagesRef, state, send, pageLabel })
  usePerfProbe(state.index)
  const recordShare = useRecordView(mode === "member" ? (views ?? null) : null, state.index)

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

  // The gallery's `?page=`: open on that page.
  useEffect(() => {
    if (initialIndex > 0) send({ type: "GOTO", index: initialIndex, source: "key" })
  }, [initialIndex, send])

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
    completeFirst: tapCompletes ? () => completeRunning(pagesRef.current?.querySelector("[data-current]")) : undefined,
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
        if (!table) return
        // On the spread, T swaps the Notes for the page's table instead of opening the sheet.
        return !framed && isSpread() ? setNotesTable((on) => !on) : send({ type: "OPEN_SHEET", sheet: "table" })
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
  const dwells = entries.map((e) => (typeof e.dwell === "number" ? e.dwell : e.dwell === "hold" ? REVEAL_DWELL_MS : null))
  const types = pages.map((page) => page.type)
  const groups = actGroups(types)

  return (
    <PlayerProvider value={send} sheet={state.mode === "sheet" ? state.sheet : null}>
      <QuizProvider year={year}>
        <MotionConfig reducedMotion={still ? "always" : "user"}>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the labelled stage region takes the story keys while focus is inside it (design 4.6) */}
          <section
            ref={root}
            tabIndex={-1}
            aria-label={`Rewind ${year}`}
            data-testid="rewind-stage"
            data-mode={state.mode}
            data-preview={preview || undefined}
            data-still={still || undefined}
            data-chrome={fit.chrome}
            data-fitted={fit.measured || undefined}
            style={FIT_DEFAULTS}
            onKeyDown={onKeyDown}
            data-rw-framed={framed || undefined}
            className={cn(framed ? "absolute" : "fixed", "inset-0 overflow-hidden overscroll-none outline-none rw-spread:bg-(--rw-paper)", FIT_VARS)}
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
            <div ref={pagesRef} className={cn("absolute inset-0 touch-pinch-zoom select-none", SPREAD_PAGES)} data-testid="rewind-pages" {...gestures} {...focusHandlers}>
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
              className={cn(chromeInk.className, "absolute inset-x-0 top-0 z-10 h-(--rw-chrome-top) text-foreground transition-opacity duration-(--rw-dur-s) rw-spread:hidden", chromeHidden && "pointer-events-none opacity-0")}
            >
              <ChromeTop
                compact={fit.chrome === "compact"}
                progress={
                  <Progress
                    dwells={dwells}
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
              className={cn(chromeInk.className, "absolute inset-x-0 bottom-0 z-10 flex h-(--rw-chrome-bottom) items-center justify-center pb-[env(safe-area-inset-bottom)] text-foreground transition-opacity duration-(--rw-dur-s) rw-spread:hidden", chromeHidden && "pointer-events-none opacity-0")}
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
                  slowerPacing={prefs.slowerPacing}
                  onDwellEnd={() => send({ type: "DWELL_END" })}
                  groups={types.map((type) => groups.findIndex((group) => group.act === pageMeta[type].act))}
                  testId="rewind-spread-progress"
                />
              }
              showPause={state.mode !== "cover" && state.mode !== "ended"}
              playing={playing}
              share={!preview}
              closeHref={closeHref}
              notes={pages[state.index].notes ?? []}
              table={table}
              showTable={notesTable}
              onToggleTable={() => setNotesTable((on) => !on)}
              onGoto={(index) => send({ type: "GOTO", index, source: "button" })}
              onPrev={() => send({ type: "PREV", source: "button" })}
              onNext={forward}
              onTogglePlay={() => send({ type: playing ? "PAUSE" : "PLAY" })}
              onShare={() => send({ type: "OPEN_SHEET", sheet: "share" })}
              onSettings={() => send({ type: "OPEN_SHEET", sheet: "settings" })}
            />
            {mode === "preview" && (
              <p
                data-testid="rewind-preview-banner"
                className="pointer-events-none absolute inset-x-0 top-(--rw-chrome-top) z-10 mx-auto w-fit rounded-full bg-background px-3 py-1 text-sm text-foreground rw-spread:top-[100px]"
              >
                Preview
              </p>
            )}
            <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="rewind-live">
              {announcement}
            </div>
            <RecordShareProvider value={recordShare}>
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
            </RecordShareProvider>
          </section>
        </MotionConfig>
      </QuizProvider>
    </PlayerProvider>
  )
}
