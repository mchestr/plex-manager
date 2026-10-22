'use client'

import { createContext, useContext } from 'react'

// The root layout provides `serverName()`; the default, `productName` (which
// lives in the server-only `lib/brand`), keeps isolated component tests rendering.
const ServerNameContext = createContext<string>('Plex Manager')

export function ServerNameProvider({ value, children }: { value: string; children: React.ReactNode }) {
  return <ServerNameContext.Provider value={value}>{children}</ServerNameContext.Provider>
}

/** The server name from `serverName()`, for client error boundaries that draw a shell (P10.17). */
export function useServerName(): string {
  return useContext(ServerNameContext)
}
