'use client'

import { createContext, useContext } from 'react'

import type { Theme } from '@/lib/design/theme'

export interface Appearance {
  /** `Config.lightThemeEnabled`: the Appearance picker shows only while it is on. */
  enabled: boolean
  /** The theme the server resolved for this request. */
  theme: Theme
}

// The root layout provides `resolveAppearance()`; the default keeps isolated
// component tests rendering, with the picker hidden.
const AppearanceContext = createContext<Appearance>({ enabled: false, theme: 'dark' })

export function AppearanceProvider({ value, children }: { value: Appearance; children: React.ReactNode }) {
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
}

/** The light-theme flag and the current theme, for the Appearance picker (P10.10). */
export function useAppearance(): Appearance {
  return useContext(AppearanceContext)
}
