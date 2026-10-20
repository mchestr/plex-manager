"use client"

import { useEffect } from "react"

/** What the performance spec (`e2e/perf/rewind.perf.spec.ts`) sets and reads on `window`. */
interface PerfProbeWindow {
  __rwPerfProbe?: boolean
  /** One entry per stage commit: the page index it rendered. */
  __rwCommits?: number[]
}

/**
 * Records every commit of the story stage while the performance spec's probe
 * flag is set (P5.4). React Profiler callbacks do not run in production
 * builds, so an effect with no dependency list stands in for them: it runs
 * after each commit and costs one property read otherwise.
 */
export function usePerfProbe(index: number): void {
  useEffect(() => {
    const probe = window as PerfProbeWindow
    if (probe.__rwPerfProbe) (probe.__rwCommits ??= []).push(index)
  })
}
