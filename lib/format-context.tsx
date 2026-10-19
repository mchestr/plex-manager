'use client'

import { createContext, useContext, useMemo } from 'react'

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
