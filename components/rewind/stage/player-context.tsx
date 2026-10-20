"use client"

import { createContext, useContext } from "react"

import type { PlayerEvent } from "@/lib/rewind/stage/player-reducer"

const PlayerContext = createContext<(event: PlayerEvent) => void>(() => {})

export const PlayerProvider = PlayerContext.Provider

/**
 * Lets an interactive island drive the player: the quiz sends
 * `INTERACT_END` when answered, the scrubber `INTERACT_START` and
 * `INTERACT_END` around a drag.
 */
export function usePlayerSend(): (event: PlayerEvent) => void {
  return useContext(PlayerContext)
}
