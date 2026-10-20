"use client"

import { useLayoutEffect, useState, type RefObject } from "react"

import { fitStage, type StageFit } from "@/lib/rewind/stage/fit-stage"

export interface FitSummary {
  chrome: StageFit["chrome"]["variant"]
  belowFloor: boolean
  largeText: boolean
}

const INITIAL: FitSummary = { chrome: "roomy", belowFloor: false, largeText: false }

/**
 * Re-fits the stage on `resize` and `visualViewport` changes. The scale and
 * sizes go straight to CSS variables on `root` (`--u`, `--rw-chrome-top`,
 * `--rw-chrome-bottom`, `--rw-artboard-h`), so React state changes only when
 * the chrome variant or one of P5.3's two article-mode flags does.
 * `safeArea` is an element padded by `env(safe-area-inset-bottom)`.
 */
export function useFitStage(root: RefObject<HTMLElement | null>, safeArea: RefObject<HTMLElement | null>): FitSummary {
  const [summary, setSummary] = useState(INITIAL)

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const viewport = window.visualViewport

    const refit = () => {
      const fit = fitStage({
        vw: viewport?.width ?? window.innerWidth,
        vh: viewport?.height ?? window.innerHeight,
        safeBottom: safeArea.current ? parseFloat(getComputedStyle(safeArea.current).paddingBottom) || 0 : 0,
        rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16,
      })
      el.style.setProperty("--u", String(fit.u))
      el.style.setProperty("--rw-chrome-top", `${fit.chrome.top}px`)
      el.style.setProperty("--rw-chrome-bottom", `${fit.chrome.bottom}px`)
      el.style.setProperty("--rw-artboard-h", String(fit.artboardH))
      setSummary((prev) =>
        prev.chrome === fit.chrome.variant && prev.belowFloor === fit.belowFloor && prev.largeText === fit.largeText
          ? prev
          : { chrome: fit.chrome.variant, belowFloor: fit.belowFloor, largeText: fit.largeText }
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
