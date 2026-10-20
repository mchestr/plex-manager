"use client"

import { useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef, type RefObject } from "react"

import type { IssuePageType } from "@/lib/rewind/registry"

import { usePick } from "./quiz-context"

const FLIGHT_MS = 375
const LAND_MS = 120
const EASE_FALLBACK = "cubic-bezier(0.2, 0, 0, 1)"

interface MatchCutProps {
  /** The pages layer: the source tile and the target slot are found inside it by page index. */
  pagesRef: RefObject<HTMLDivElement | null>
  types: readonly IssuePageType[]
  index: number
  previous: number | null
}

/**
 * The quiz match cut (Rewind design G5, 5.6): on the turn from 04 Guess to
 * 05 Top shows, a copy of the chosen tile flies from its place on page 04
 * into page 05's No. 1 poster slot in 375 ms with `--rw-ease-ui`, then
 * fades as it lands. The copy lives in this stage-level layer, above both
 * pages, so the incoming page's ink-roll wipe never clips it.
 *
 * The flight is a measured transform (FLIP) on the layer's own copy: both
 * ends are read from the DOM at the turn, so it needs no layout animation
 * from Motion (`domMax`). Only `transform` and `opacity` move. Nothing flies
 * under reduced motion, for a mixed films-and-series quiz (whose answer may
 * not be page 05's No. 1), or without an answer.
 */
export function MatchCut({ pagesRef, types, index, previous }: MatchCutProps) {
  const layer = useRef<HTMLDivElement>(null)
  const pick = usePick()
  const reduce = useReducedMotion()
  // Read at the turn only: the flight starts when the page changes, not when the stage re-renders.
  const latest = useRef({ pick, reduce, types })
  useLayoutEffect(() => {
    latest.current = { pick, reduce, types }
  })

  useLayoutEffect(() => {
    const { pick, reduce, types } = latest.current
    const host = layer.current
    const pages = pagesRef.current
    if (reduce || !host || !pages || pick?.kind !== "series") return
    if (previous === null || types[previous] !== "guess" || types[index] !== "top-shows") return
    const source = pages.querySelector<HTMLElement>(`[data-index="${previous}"] [data-rw-quiz-pick]`)
    const target = pages.querySelector<HTMLElement>(`[data-index="${index}"] [data-rw-match-slot]`)
    if (!source || !target || typeof source.animate !== "function") return

    const origin = host.getBoundingClientRect()
    const from = source.getBoundingClientRect()
    const to = target.getBoundingClientRect()
    if (from.width === 0 || to.width === 0) return

    const copy = source.cloneNode(true) as HTMLElement
    copy.removeAttribute("data-rw-quiz-pick")
    copy.setAttribute("data-testid", "rewind-match-cut")
    Object.assign(copy.style, {
      position: "absolute",
      left: `${from.left - origin.left}px`,
      top: `${from.top - origin.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: "0",
      transformOrigin: "0 0",
    })
    host.appendChild(copy)

    const ease = getComputedStyle(host).getPropertyValue("--rw-ease-ui").trim() || EASE_FALLBACK
    const end = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width}, ${to.height / from.height})`
    const flight = copy.animate([{ transform: "none" }, { transform: end }], { duration: FLIGHT_MS, easing: ease, fill: "forwards" })
    const land = copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LAND_MS, delay: FLIGHT_MS, fill: "forwards" })
    land.onfinish = () => copy.remove()

    return () => {
      flight.cancel()
      land.cancel()
      copy.remove()
    }
  }, [index, previous, pagesRef])

  return <div ref={layer} aria-hidden className="pointer-events-none absolute inset-0 z-5" data-testid="rewind-match-cut-layer" />
}
