"use client"

import type { Route } from "next"
import { Pause, Play, SlidersHorizontal, X } from "lucide-react"
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
  onSettings: () => void
  onTogglePlay: () => void
}

/**
 * The top chrome, in CSS pixels outside the scaled artboard: the progress
 * segments, the folio (the only place a page name appears) and the Settings,
 * Pause and Close circles (design 4.6). A 500 ms press on Pause opens
 * Settings instead of toggling it.
 */
export function ChromeTop({ compact, progress, page, pageCount, pageName, showPause, playing, closeHref, onSettings, onTogglePlay }: ChromeTopProps) {
  const pressedAt = useRef<number | null>(null)
  const pad = (n: number) => String(n).padStart(2, "0")

  return (
    <div className={cn("flex flex-col px-3 font-display", compact ? "gap-0 pt-1.5" : "gap-2 pt-2.5")}>
      {progress}
      <div className="flex h-11 items-center justify-between pl-1">
        <p className="flex items-baseline gap-2 text-ui font-semibold" data-testid="rewind-folio">
          <span className="tabular-nums">
            <span className="text-lead font-black">{pad(page)}</span>
            <span className="opacity-80">/{pad(pageCount)}</span>
          </span>
          <span>{pageName}</span>
        </p>
        <div className="flex gap-1.5">
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
        </div>
      </div>
    </div>
  )
}
