"use client"

import { useReducedMotion } from "motion/react"
import { startTransition, useCallback, useEffect, useReducer } from "react"

import { initPlayer, playerReducer, type PageKind, type PlayerEvent } from "@/lib/rewind/stage/player-reducer"

const TURNS = new Set<PlayerEvent["type"]>(["CHOOSE_CUT", "NEXT", "PREV", "GOTO", "DWELL_END", "READ_AGAIN"])

/**
 * The player reducer with its browser inputs: autoplay is off under
 * `prefers-reduced-motion` or when the preference is off, and a hidden tab
 * pauses. Page turns dispatch inside `startTransition`, so the turn is one
 * class toggle that never blocks input.
 */
export function useStoryPlayer(kinds: readonly PageKind[], autoplayPref: boolean) {
  const reducedMotion = useReducedMotion() ?? false
  const autoplay = autoplayPref && !reducedMotion
  const [state, dispatch] = useReducer(playerReducer, { kinds, autoplay }, initPlayer)

  const send = useCallback((event: PlayerEvent) => {
    if (TURNS.has(event.type)) startTransition(() => dispatch(event))
    else dispatch(event)
  }, [])

  useEffect(() => {
    dispatch({ type: "SET_AUTOPLAY", autoplay })
  }, [autoplay])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") dispatch({ type: "HIDDEN" })
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [])

  return { state, send }
}

