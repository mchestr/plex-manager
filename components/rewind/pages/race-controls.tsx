"use client"

import { useEffect, useRef, useState, type FocusEvent } from "react"

import { usePlayerSend } from "@/components/rewind/stage/player-context"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"

/** The live line waits this long after the last move, so a drag is announced once. */
const LIVE_DEBOUNCE_MS = 400

interface RaceControlsProps {
  /** One month label per frame, in `Config.locale` ("August"). */
  months: readonly string[]
  /** The live line per frame: "Standings after August: Severance first, Shogun second." */
  standings: readonly string[]
  /** Shows a frame at once, with no React commit per bar. */
  onSeek: (frame: number) => void
  /** Reruns the race from January. */
  onReplay: () => void
}

/**
 * The race's scrubber and Replay (P8.3, design 4.3 page 11): a `Slider` from
 * the first frame to the last (11 during the season, 12 in a whole-year issue)
 * whose value is spoken as the month, and an outline Replay pill. While a
 * finger is down on them or focus is inside, the story is `interacting`, so
 * autoplay waits. A polite live line reads the standings 400 ms after the
 * last move.
 */
export function RaceControls({ months, standings, onSeek, onReplay }: RaceControlsProps) {
  const send = usePlayerSend()
  const root = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const last = months.length - 1
  const [frame, setFrame] = useState(last)
  const [live, setLive] = useState("")

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const seek = (value: number) => {
    setFrame(value)
    onSeek(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setLive(standings[value] ?? ""), LIVE_DEBOUNCE_MS)
  }

  const start = () => send({ type: "INTERACT_START" })
  // A release keeps the pause while focus stays on the controls; leaving them ends it.
  const release = () => {
    if (!root.current?.contains(document.activeElement)) send({ type: "INTERACT_END" })
  }
  const blur = (event: FocusEvent<HTMLDivElement>) => {
    if (!root.current?.contains(event.relatedTarget as Node | null)) send({ type: "INTERACT_END" })
  }

  return (
    <div
      ref={root}
      data-rw-interactive
      data-testid="rewind-race-controls"
      className="flex items-center gap-4"
      style={{ marginTop: "calc(var(--u) * 12px)" }}
      onPointerDown={start}
      onPointerUp={release}
      onPointerCancel={release}
      onFocus={start}
      onBlur={blur}
    >
      <Button
        variant="ink-outline"
        size="pill"
        data-testid="rewind-race-play"
        onClick={() => {
          setFrame(last)
          onReplay()
        }}
      >
        Replay
      </Button>
      <Slider
        aria-label="Month"
        data-testid="rewind-race-scrubber"
        min={0}
        max={last}
        step={1}
        value={frame}
        onValueChange={(value) => seek(Array.isArray(value) ? value[0] : value)}
        getAriaValueText={(_formatted, value) => months[value] ?? ""}
        className="min-w-0 flex-1"
      />
      <p aria-live="polite" className="sr-only" data-testid="rewind-race-live">
        {live}
      </p>
    </div>
  )
}
