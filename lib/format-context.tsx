'use client'

import { createContext, useContext, useMemo, useSyncExternalStore } from 'react'

import { browserTimeZone } from '@/lib/utils/browser-zone'
import { bindFormat, type FormatSettings } from '@/lib/utils/format'

// The root layout provides the real settings; the default keeps isolated
// component tests and error boundaries rendering.
const FormatContext = createContext<FormatSettings>({ timeZone: 'UTC', locale: 'en-US' })

export function FormatProvider({ value, children }: { value: FormatSettings; children: React.ReactNode }) {
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>
}

/** The formatters bound to the app's zone and locale, as the server uses them. */
export function useFormat() {
  const settings = useContext(FormatContext)
  return useMemo(() => bindFormat(settings), [settings])
}

const subscribe = () => () => {}

/**
 * The formatters bound to the browser's zone and the app locale, for times
 * the viewer reads on their own clock (the assistant transcript). The server
 * render and hydration use the app zone, as does a browser whose zone the app
 * does not know, so hydration never mismatches.
 */
export function useBrowserFormat() {
  const settings = useContext(FormatContext)
  const timeZone = useSyncExternalStore(subscribe, browserTimeZone, () => null) ?? settings.timeZone
  return useMemo(() => bindFormat({ ...settings, timeZone }), [settings, timeZone])
}
