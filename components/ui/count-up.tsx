"use client"

import { animate, useMotionValue, useReducedMotion } from "motion/react"
import { useEffect, useRef } from "react"

const formatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })

interface CountUpProps {
  value: number
  /** Seconds. */
  duration?: number
  /** Seconds before the count starts. */
  delay?: number
}

/**
 * Counts from 0 up to `value`. Screen readers get the final value from the
 * first render in an `sr-only` span; the animated digits are `aria-hidden` and
 * written straight to the DOM, so the count never re-renders React. Under
 * reduced motion the digits jump to the final value.
 */
export function CountUp({ value, duration = 2, delay = 0 }: CountUpProps) {
  const reduceMotion = useReducedMotion()
  const count = useMotionValue(0)
  const digits = useRef<HTMLSpanElement>(null)

  useEffect(
    () =>
      count.on("change", (latest) => {
        if (digits.current) digits.current.textContent = formatter.format(Math.round(latest))
      }),
    [count]
  )

  useEffect(() => {
    if (reduceMotion) {
      count.jump(value)
      return
    }
    const controls = animate(count, value, { duration, delay, ease: [0.16, 1, 0.3, 1] })
    return () => controls.stop()
  }, [count, value, duration, delay, reduceMotion])

  return (
    <>
      <span className="sr-only">{formatter.format(value)}</span>
      <span aria-hidden="true" ref={digits}>
        {formatter.format(0)}
      </span>
    </>
  )
}
