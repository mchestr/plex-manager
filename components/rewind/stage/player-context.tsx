"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { PlayerEvent, SheetName } from "@/lib/rewind/stage/player-reducer"

const PlayerContext = createContext<(event: PlayerEvent) => void>(() => {})
const SheetContext = createContext<SheetName | null>(null)

/** The player's `send`, and the open sheet (null when none is), for the page islands. */
export function PlayerProvider({ value, sheet = null, children }: { value: (event: PlayerEvent) => void; sheet?: SheetName | null; children: ReactNode }) {
  return (
    <PlayerContext.Provider value={value}>
      <SheetContext.Provider value={sheet}>{children}</SheetContext.Provider>
    </PlayerContext.Provider>
  )
}

/**
 * Lets an interactive island drive the player: the quiz sends
 * `INTERACT_END` when answered, the scrubber `INTERACT_START` and
 * `INTERACT_END` around a drag.
 */
export function usePlayerSend(): (event: PlayerEvent) => void {
  return useContext(PlayerContext)
}

/**
 * A sheet a page opens itself ("Why this?", Contents) through the player's
 * `sheet` mode, so autoplay pauses while it is open and Esc closes the sheet
 * before the story.
 */
export function useStageSheet(name: SheetName) {
  const send = usePlayerSend()
  const open = useContext(SheetContext) === name
  return {
    open,
    show: () => send({ type: "OPEN_SHEET", sheet: name }),
    close: () => send({ type: "CLOSE_SHEET" }),
  }
}
