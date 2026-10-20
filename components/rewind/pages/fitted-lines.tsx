import { Fragment, type CSSProperties } from "react"

import type { FitResult } from "@/lib/rewind/typeset/fit-lines"
import { cn } from "@/lib/utils"

import { axes, u } from "./units"

const TNUM = '"tnum" 1, "lnum" 1'
/** Safe mode (design 4.9): the system stack, no width fitting, balanced lines. */
const SAFE_STACK = '"Noto Sans", "Noto Sans CJK JP", system-ui, sans-serif'

interface FittedLinesProps {
  fit: FitResult
  weight: number
  tnum?: boolean
  lineHeight?: number
  className?: string
}

/**
 * Lines the server typeset with `fitLines`, each a nowrap block at its own
 * width step, so the browser never re-wraps them (design 5.4). Inside a
 * heading this is plain text: an ellipsized title keeps its full text in an
 * `sr-only` span and hides the cut lines.
 */
export function FittedLines({ fit, weight, tnum = false, lineHeight = 0.86, className }: FittedLinesProps) {
  if (fit.safeMode) {
    return (
      <span dir="auto" className={cn("block text-balance", className)} style={{ fontFamily: SAFE_STACK, fontSize: u(fit.size), lineHeight: 1.05 }}>
        {fit.ariaLabel}
      </span>
    )
  }
  const style: CSSProperties = { fontSize: u(fit.size), lineHeight, letterSpacing: "-0.01em", ...(tnum ? { fontFeatureSettings: TNUM } : {}) }
  // a space between the block lines keeps the heading's text whole ("or: How"); it does not render
  const lines = fit.lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && " "}
      <span className="block whitespace-nowrap" style={{ fontVariationSettings: axes(line.wdth, weight) }}>
        {line.text}
      </span>
    </Fragment>
  ))
  return (
    <span className={cn("block font-display", className)} style={style}>
      {fit.ellipsized ? (
        <>
          <span className="sr-only">{fit.ariaLabel}</span>
          <span aria-hidden>{lines}</span>
        </>
      ) : (
        lines
      )}
    </span>
  )
}
