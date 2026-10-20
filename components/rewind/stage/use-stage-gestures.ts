"use client"

import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react"

import { classifyPress, HOLD_MS, isHold, type Gesture, type PointerSample, type PressOrigin } from "@/lib/rewind/stage/gestures"

export interface GestureHandlers {
  onGesture: (gesture: Exclude<Gesture, { kind: "none" | "hold" }>) => void
  onHoldStart: () => void
  onHoldEnd: () => void
}

interface Press {
  id: number
  origin: PressOrigin
  left: number
  width: number
  samples: PointerSample[]
  holding: boolean
  timer: ReturnType<typeof setTimeout> | null
}

/**
 * Feeds pointer samples from the page layer to the pure classifier in
 * `lib/rewind/stage/gestures`. A press that starts inside
 * `[data-rw-interactive]` is left alone. One timer checks for a hold at
 * 250 ms; nothing else runs while a finger is down.
 */
export function useStageGestures({ onGesture, onHoldStart, onHoldEnd }: GestureHandlers) {
  const press = useRef<Press | null>(null)
  const handlers = useRef({ onGesture, onHoldStart, onHoldEnd })
  useEffect(() => {
    handlers.current = { onGesture, onHoldStart, onHoldEnd }
  })

  const end = useCallback((event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const current = press.current
    if (!current || current.id !== event.pointerId) return
    press.current = null
    if (current.timer) clearTimeout(current.timer)
    if (current.holding) return handlers.current.onHoldEnd()
    if (cancelled) return
    current.samples.push({ x: event.clientX - current.left, y: event.clientY, t: event.timeStamp })
    const gesture = classifyPress(current.samples, current.width, current.origin)
    if (gesture.kind !== "none" && gesture.kind !== "hold") handlers.current.onGesture(gesture)
  }, [])

  useEffect(() => () => {
    if (press.current?.timer) clearTimeout(press.current.timer)
  }, [])

  return {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0 || press.current) return
      const target = event.target instanceof Element ? event.target : null
      const origin: PressOrigin = target?.closest("[data-rw-interactive]") ? "interactive" : "artboard"
      if (origin !== "artboard") return
      const rect = event.currentTarget.getBoundingClientRect()
      const current: Press = {
        id: event.pointerId,
        origin,
        left: rect.left,
        width: rect.width,
        samples: [{ x: event.clientX - rect.left, y: event.clientY, t: event.timeStamp }],
        holding: false,
        timer: null,
      }
      current.timer = setTimeout(() => {
        if (press.current === current && isHold(current.samples, current.samples[0].t + HOLD_MS)) {
          current.holding = true
          handlers.current.onHoldStart()
        }
      }, HOLD_MS)
      press.current = current
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const current = press.current
      if (current?.id === event.pointerId) current.samples.push({ x: event.clientX - current.left, y: event.clientY, t: event.timeStamp })
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => end(event, false),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => end(event, true),
  }
}
