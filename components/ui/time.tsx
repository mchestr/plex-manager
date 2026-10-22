'use client'

import { useSyncExternalStore } from 'react'

import { useFormat } from '@/lib/format-context'

// One shared minute clock for every <Time> on the page.
let now = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | null = null

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    now = Date.now()
    timer = setInterval(() => {
      now = Date.now()
      listeners.forEach((notify) => notify())
    }, 60_000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

const getNow = () => now
const getServerNow = () => null

interface TimeProps {
  /** An ISO timestamp, or a Date from a Server Component prop. */
  value: string | Date
  className?: string
  /** Read instead of the relative time within a minute of now, such as "just now". */
  nowLabel?: string
  'data-testid'?: string
}

/**
 * A timestamp. The server render and hydration show the absolute date and
 * time in the app zone; after mount it reads as relative time ("5 minutes
 * ago"), refreshed each minute, with the viewer-local date in `title`.
 */
export function Time({ value, className, nowLabel, 'data-testid': testId }: TimeProps) {
  const format = useFormat()
  const current = useSyncExternalStore(subscribe, getNow, getServerNow)
  const date = typeof value === 'string' ? new Date(value) : value

  return (
    <time
      dateTime={date.toISOString()}
      className={className}
      data-testid={testId}
      title={current === null ? undefined : localDateTime(date, format.settings.locale)}
    >
      {current === null
        ? format.dateTime(date)
        : nowLabel && Math.abs(current - date.getTime()) < 60_000
          ? nowLabel
          : format.relative(date, current)}
    </time>
  )
}

function localDateTime(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
