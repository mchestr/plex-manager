'use client'

import { ToastProvider } from '@/components/ui/toast'
import { FormatProvider } from '@/lib/format-context'
import type { FormatSettings } from '@/lib/utils/format'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SessionProvider } from 'next-auth/react'
import { useState } from 'react'

export function Providers({ children, format }: { children: React.ReactNode; format: FormatSettings }) {
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
        <FormatProvider value={format}>
          <ToastProvider>
            {children}
          </ToastProvider>
        </FormatProvider>
      </QueryClientProvider>
    </SessionProvider>
  )
}
