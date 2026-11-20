"use client"

import { useEffect, useRef, type ReactNode } from "react"

import { SheetTitle } from "@/components/ui/sheet"

/** A step's heading, which takes focus when the step appears. */
export function StepHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <SheetTitle ref={ref} tabIndex={-1} className="focus-visible:outline-none" data-testid="report-step-heading">
      {children}
    </SheetTitle>
  )
}
