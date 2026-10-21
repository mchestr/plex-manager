"use client"

import { useLayoutEffect, useState, type RefObject } from "react"

import { fitSpread, fitStage, spreadColumns, type StageFit } from "@/lib/rewind/stage/fit-stage"

export interface FitSummary {
  chrome: StageFit["chrome"]["variant"]
  /** False until the first fit, which runs once the stage has hydrated. */
  measured: boolean
  belowFloor: boolean
  largeText: boolean
}

const INITIAL: FitSummary = { chrome: "roomy", measured: false, belowFloor: false, largeText: false }

/**
 * Re-fits the stage on `resize` and `visualViewport` changes. The scale and
 * sizes go straight to CSS variables on `root` (`--rw-u-story`,
 * `--rw-chrome-top`, `--rw-chrome-bottom`, `--rw-artboard-h-story`, and the
 * desktop spread's `--rw-u-spread`, `--rw-rail-w` and `--rw-notes-w`); the
 * stage's classes pick `--u` from the story or the spread by media query, so
 * React state changes only when the chrome variant or one of P5.3's two
 * article-mode flags does.
 * `safeArea` is an element padded by `env(safe-area-inset-bottom)`.
 */
export function useFitStage(root: RefObject<HTMLElement | null>, safeArea: RefObject<HTMLElement | null>): FitSummary {
  const [summary, setSummary] = useState(INITIAL)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const viewport = window.visualViewport

    const refit = () => {
      const vw = viewport?.width ?? window.innerWidth
      const vh = viewport?.height ?? window.innerHeight
      const fit = fitStage({
        vw,
        vh,
        safeBottom: safeArea.current ? parseFloat(getComputedStyle(safeArea.current).paddingBottom) || 0 : 0,
        rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
      })
      const columns = spreadColumns(vw)
      el.style.setProperty("--rw-u-story", String(fit.u))
      el.style.setProperty("--rw-chrome-top", `${fit.chrome.top}px`)
      el.style.setProperty("--rw-chrome-bottom", `${fit.chrome.bottom}px`)
      el.style.setProperty("--rw-artboard-h-story", String(fit.artboardH))
      el.style.setProperty("--rw-u-spread", String(fitSpread({ vw, vh, ...columns })))
      el.style.setProperty("--rw-rail-w", `${columns.railW}px`)
      el.style.setProperty("--rw-notes-w", `${columns.notesW}px`)
      setSummary((prev) =>
        prev.measured && prev.chrome === fit.chrome.variant && prev.belowFloor === fit.belowFloor && prev.largeText === fit.largeText
          ? prev
          : { chrome: fit.chrome.variant, measured: true, belowFloor: fit.belowFloor, largeText: fit.largeText }
      )
    }

    refit()
    window.addEventListener("resize", refit)
    viewport?.addEventListener("resize", refit)
    return () => {
      window.removeEventListener("resize", refit)
      viewport?.removeEventListener("resize", refit)
    }
  }, [root, safeArea])

  return summary
}
