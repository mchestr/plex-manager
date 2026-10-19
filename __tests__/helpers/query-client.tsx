/**
 * A fresh TanStack Query client per test, with retries off so a failing
 * query settles at once.
 *
 * @example
 * ```tsx
 * render(<Card />, { wrapper: createQueryWrapper() })
 * ```
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

export function createQueryWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}
