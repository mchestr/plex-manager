import type { ReactNode } from "react"

import { PublicShell } from "@/components/shell/public-shell"
import { serverName } from "@/lib/brand"
import { NO_SCRIPT_STREAM } from "@/lib/ui/no-script-stream"

/**
 * The public shell of the pages an email links to, outside `(app)`, so they
 * need no sign-in. They must work without JavaScript, so the streamed page
 * shows then too (`NO_SCRIPT_STREAM`).
 */
export default async function EmailLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <noscript>
        <style>{NO_SCRIPT_STREAM}</style>
      </noscript>
      <PublicShell serverName={await serverName()}>{children}</PublicShell>
    </>
  )
}
