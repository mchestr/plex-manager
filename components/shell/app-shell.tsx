import type { ReactNode } from "react"

import type { AppChromeProps } from "@/components/shell/app-chrome"
import { ShellChrome } from "@/components/shell/shell-chrome"

export interface AppShellProps extends AppChromeProps {
  children: ReactNode
}

/**
 * The member shell (ui-design-system 6.1, UI-30): a sticky top bar with the
 * Wordmark, the nav, an Admin link for admins and the account menu; below
 * `md` a 56px bar whose menu button opens a Sheet with the same links. Under
 * it sits the notice slot, then the page's one `<main id="main">`.
 *
 * Rewind pages draw their own chrome, so the bar and notice step aside there
 * (`isImmersiveRoute`), and their code stays out of Rewind's bundle
 * (`AppChrome` loads on demand).
 */
export function AppShell({ children, ...chrome }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background" data-testid="app-shell">
      <ShellChrome {...chrome} />
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
    </div>
  )
}
