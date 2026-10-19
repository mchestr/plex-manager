'use client'

import { ToastProvider } from '@/components/ui/toast'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { SessionProvider } from 'next-auth/react'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
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

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {/* The OS reduced-motion setting turns off transform and layout animations app-wide. */}
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            {children}
          </ToastProvider>
        </MotionConfig>
      </QueryClientProvider>
    </SessionProvider>
  )
}

