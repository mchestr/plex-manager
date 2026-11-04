'use client'

import { createContext, useContext } from 'react'

import type { Branding } from '@/lib/branding/settings'

/** The uploaded images' URLs; the root layout provides them from `getBranding()`. Empty in isolated tests. */
const BrandAssetsContext = createContext<Branding['assets']>({})

export function BrandAssetsProvider({ value, children }: { value: Branding['assets']; children: React.ReactNode }) {
  return <BrandAssetsContext.Provider value={value}>{children}</BrandAssetsContext.Provider>
}

/** The uploaded wordmark, icon, favicon and login background URLs, each when set. */
export function useBrandAssets(): Branding['assets'] {
  return useContext(BrandAssetsContext)
}
