import type { ReactNode } from "react"

import { Wordmark } from "@/components/ui/wordmark"
import { productName } from "@/lib/brand"

/**
 * The setup shell (design 6.5, UI-15, UI-16): the Wordmark with "Setup" and
 * a note that progress is kept, then the step. No space background.
 */
export default function SetupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 items-center justify-between gap-4 border-b px-4 sm:px-6">
        <span className="flex min-w-0 items-center gap-2">
          <Wordmark serverName={productName} />
          <span className="text-body text-muted-foreground">Setup</span>
        </span>
        <span className="hidden text-label text-muted-foreground sm:inline">Setup saves your progress after each step</span>
      </header>
      <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:py-10">
        {children}
      </main>
    </div>
  )
}
