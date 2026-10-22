'use client'

import { ToastProvider } from '@/components/ui/toast'
import { AppearanceProvider, type Appearance } from '@/lib/appearance-context'
import { ServerNameProvider } from '@/lib/brand-context'
import { FormatProvider } from '@/lib/format-context'
import type { FormatSettings } from '@/lib/utils/format'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { useState } from 'react'

export function Providers({
  children,
  format,
  serverName,
  appearance,
}: {
  children: React.ReactNode
  format: FormatSettings
  serverName: string
  appearance: Appearance
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  // No next-auth SessionProvider: nothing reads useSession (signIn and signOut
  // work without it), and its session fetch on mount changed context above the
  // still-hidden streamed page, so React rendered a second copy of the page
  // beside the hidden one instead of revealing it.
  return (
    <QueryClientProvider client={queryClient}>
      {/* The OS reduced-motion setting turns off transform and layout animations app-wide. */}
      <MotionConfig reducedMotion="user">
        <FormatProvider value={format}>
          <ServerNameProvider value={serverName}>
            <AppearanceProvider value={appearance}>
              <ToastProvider>
                {children}
              </ToastProvider>
            </AppearanceProvider>
          </ServerNameProvider>
        </FormatProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
