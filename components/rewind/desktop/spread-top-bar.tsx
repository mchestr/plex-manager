"use client"

import { Pause, Play, Share, SlidersHorizontal, X } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import type { ActGroup } from "@/lib/rewind/stage/acts"
import { cn } from "@/lib/utils"

interface SpreadTopBarProps {
  /** The server's name, set before "Rewind {year}" as `rewindName(year)` reads. */
  serverName?: string
  year: number
  groups: readonly ActGroup[]
  index: number
  onGoto: (index: number) => void
  /** The progress segments, grouped by act. */
  progress: ReactNode
  showPause: boolean
  playing: boolean
  onTogglePlay: () => void
  /** False in preview mode and on the back cover, which carries its own share actions. */
  share: boolean
  onShare: () => void
  onSettings: () => void
  closeHref: Route
}

/**
 * The spread's top bar (design 4.7): the brand, the act tabs (a `nav` of
 * buttons that jump to each act's first selected page, the current act
 * marked `aria-current`), the labelled Pause, "Share this page", Settings and
 * Close, and the progress grouped by act beneath.
 */
export function SpreadTopBar({ serverName, year, groups, index, onGoto, progress, showPause, playing, onTogglePlay, share, onShare, onSettings, closeHref }: SpreadTopBarProps) {
  const currentAct = groups.find((group) => group.pages.includes(index))?.act

  return (
    <div className="pointer-events-auto absolute inset-x-6 top-0 flex h-[100px] flex-col justify-center gap-3 font-display" data-testid="rewind-spread-top-bar">
      <div className="flex items-center gap-6">
        <p className="flex min-w-0 items-baseline gap-3 font-semibold">
          {serverName && <span className="truncate text-ui">{serverName}</span>}
          <span className="text-2xl font-black whitespace-nowrap">Rewind {year}</span>
        </p>
        <nav aria-label="Acts" className="mx-auto">
          <ul className="flex gap-1">
            {groups.map((group) => {
              const current = group.act === currentAct
              return (
                <li key={group.act}>
                  <Button
                    variant="ghost"
                    size="lg"
                    aria-current={current ? "true" : undefined}
                    data-testid={`rewind-spread-act-${group.act}`}
                    className={cn("px-3 hover:bg-transparent hover:text-foreground hover:underline", current && "underline decoration-2 underline-offset-8")}
                    onClick={() => onGoto(group.pages[0])}
                  >
                    {group.label}
                  </Button>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          {showPause && (
            <Button variant="ink-outline" size="pill" data-testid="rewind-spread-pause" onClick={onTogglePlay} icon={<Icon icon={playing ? Pause : Play} />}>
              {playing ? "Pause" : "Play"}
            </Button>
          )}
          {share && (
            <Button variant="ink" size="pill" aria-haspopup="dialog" data-testid="rewind-spread-share" onClick={onShare} icon={<Icon icon={Share} />}>
              Share this page
            </Button>
          )}
          <Button variant="ink-outline" size="icon-pill" aria-label="Settings" aria-haspopup="dialog" data-testid="rewind-spread-settings" onClick={onSettings}>
            <Icon icon={SlidersHorizontal} />
          </Button>
          <Button variant="ink-outline" size="icon-pill" aria-label="Close Rewind" data-testid="rewind-spread-close" nativeButton={false} render={<Link href={closeHref} />}>
            <Icon icon={X} />
          </Button>
        </div>
      </div>
      {progress}
    </div>
  )
}
