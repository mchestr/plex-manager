"use client"

import type { Route } from "next"
import { Maximize, Minimize, Pause, Play, SlidersHorizontal, X } from "lucide-react"
import Link from "next/link"
import { useRef, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { pausePress } from "@/lib/rewind/stage/gestures"
import { cn } from "@/lib/utils"

interface ChromeTopProps {
  compact: boolean
  progress: ReactNode
  /** 1-based page number. */
  page: number
  pageCount: number
  pageName: string
  /** Pause is hidden on the cover and the back cover, where nothing autoplays. */
  showPause: boolean
  playing: boolean
  closeHref: Route
  /** Close is left out in the admin preview's frame, where Full screen takes its place. */
  showClose: boolean
  /** Full screen (`useStageFullscreen`), or null where the stage does not offer it. */
  fullscreen: { active: boolean; onToggle: () => void } | null
  onSettings: () => void
  onTogglePlay: () => void
}

/**
 * The top chrome, in CSS pixels outside the scaled artboard: the progress
 * segments, the folio (the only place a page name appears) and the Full
 * screen (where offered), Settings, Pause and Close circles (design 4.6), at
 * most three of them inside the admin preview's narrow frame. A 500 ms press
 * on Pause opens Settings instead of toggling it. The page name truncates on
 * the narrowest phones rather than push the circles off.
 */
export function ChromeTop({ compact, progress, page, pageCount, pageName, showPause, playing, closeHref, showClose, fullscreen, onSettings, onTogglePlay }: ChromeTopProps) {
  const pressedAt = useRef<number | null>(null)
  const pad = (n: number) => String(n).padStart(2, "0")

  return (
    <div className={cn("flex flex-col px-3 font-display", compact ? "gap-0 pt-1.5" : "gap-2 pt-2.5")}>
      {progress}
      <div className="flex h-11 items-center justify-between pl-1">
        <p className="flex min-w-0 items-baseline gap-2 text-ui font-semibold" data-testid="rewind-folio">
          <span className="shrink-0 tabular-nums">
            <span className="text-lead font-black">{pad(page)}</span>
            <span className="opacity-80">/{pad(pageCount)}</span>
          </span>
          <span className="truncate">{pageName}</span>
        </p>
        <div className="flex shrink-0 gap-1.5">
          {fullscreen && (
            <Button
              variant="ink-outline"
              size="icon-pill"
              aria-label={fullscreen.active ? "Exit full screen" : "Full screen"}
              data-testid="rewind-fullscreen"
              onClick={fullscreen.onToggle}
            >
              <Icon icon={fullscreen.active ? Minimize : Maximize} />
            </Button>
          )}
          <Button variant="ink-outline" size="icon-pill" aria-label="Settings" aria-haspopup="dialog" data-testid="rewind-settings" onClick={onSettings}>
            <Icon icon={SlidersHorizontal} />
          </Button>
          {showPause && (
            <Button
              variant="ink-outline"
              size="icon-pill"
              aria-label={playing ? "Pause" : "Play"}
              data-testid="rewind-pause"
              onPointerDown={() => {
                pressedAt.current = performance.now()
              }}
              onClick={() => {
                const started = pressedAt.current
                pressedAt.current = null
                if (started !== null && pausePress(performance.now() - started) === "settings") onSettings()
                else onTogglePlay()
              }}
            >
              <Icon icon={playing ? Pause : Play} />
            </Button>
          )}
          {showClose && (
            <Button
              variant="ink-outline"
              size="icon-pill"
              aria-label="Close Rewind"
              data-testid="rewind-close"
              nativeButton={false}
              render={<Link href={closeHref} />}
            >
              <Icon icon={X} />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
