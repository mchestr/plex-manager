import type { ReactNode } from "react"

import { CannotEmailTable, FirstWarningTable, WaitingTable } from "@/components/admin/inactivity/warned-table"
import type { InactivityPreview } from "@/lib/data/inactivity-preview"

/** One list: its heading, what it holds, then its table, or a line when no one is in it. */
function List({ id, title, description, none, count, children }: {
  id: string
  title: string
  description: string
  none: string
  count: number
  children: ReactNode
}) {
  return (
    <section aria-labelledby={`admin-inactivity-${id}-heading`} className="flex flex-col gap-2" data-testid={`admin-inactivity-${id}-section`}>
      <h3 id={`admin-inactivity-${id}-heading`} className="text-ui font-medium text-foreground">
        {title}
      </h3>
      <p className="text-ui text-muted-foreground">{description}</p>
      {count > 0 ? children : <p className="text-ui text-muted-foreground" data-testid={`admin-inactivity-${id}-none`}>{none}</p>}
    </section>
  )
}

/**
 * What a run does with warnings now. While warnings or automatic removal are
 * off, no run sends a warning (the sweep stops before its warning step), so
 * the lists are what the first run after the switch-on would do. Without the
 * Plex shares, a run stops before the warning step too.
 */
function stateText({ warningsOn, removalOn, shareCheck }: { warningsOn: boolean; removalOn: boolean; shareCheck: boolean }): string {
  const lines: string[] = []
  if (warningsOn && removalOn) lines.push("Each run emails members before it removes them, and removes a member only after their last warning.")
  if (!warningsOn) lines.push("Warning emails are off.")
  if (!removalOn) lines.push(`Automatic removal is ${warningsOn ? "off" : "off too"}, so no run sends warnings or removes anyone.`)
  if (!warningsOn || !removalOn) {
    const what = !warningsOn && !removalOn ? "both" : warningsOn ? "it" : "them"
    lines.push(`The lists below show who the first run after you turn ${what} on would warn, and who it cannot email.`)
  }
  if (shareCheck) lines.push("The Plex shares could not be read, so the lists can include members who no longer have access, and runs send no warnings until this is fixed.")
  return lines.join(" ")
}

/**
 * The warning emails before removal: who waits for the date a warning named,
 * who the next daily run warns first, and who of them the app cannot email
 * (`lib/inactivity/notice-lists.ts`). While warnings or automatic removal
 * are off, the last two show what turning them on would do, so an admin can
 * read them first.
 */
export function WarningLists({ preview, removalOn, now }: { preview: InactivityPreview; removalOn: boolean; now: number }) {
  return (
    <section aria-labelledby="admin-inactivity-warnings-heading" className="flex flex-col gap-4" data-testid="admin-inactivity-warnings">
      <div className="flex flex-col gap-1">
        <h2 id="admin-inactivity-warnings-heading" className="text-h3">
          Warned members
        </h2>
        <p className="text-ui text-muted-foreground" data-testid="admin-inactivity-warnings-state">
          {stateText({ warningsOn: preview.warningsOn, removalOn, shareCheck: preview.shareCheck !== null })}
        </p>
      </div>
      <List
        id="waiting"
        title="Waiting for their date"
        description="Members with an open warning. A run removes them on or after the date it names, unless they play."
        none="No member has an open warning."
        count={preview.waiting.length}
      >
        <WaitingTable rows={preview.waiting} />
      </List>
      <List
        id="first"
        title="First warning at the next run"
        description="Members with no warning yet whom the next daily run warns, the longest inactive first, with the date it names."
        none="The next run warns no one for the first time."
        count={preview.firstWarnings.length}
      >
        <FirstWarningTable rows={preview.firstWarnings} now={now} />
      </List>
      <List
        id="cannot-email"
        title="Cannot email"
        description="Members of the two lists above whom the app cannot email. While email is set up, their warnings are skipped and their removal date still applies. While email is not set up, they wait with everyone else."
        none="The app can email every member in the two lists above."
        count={preview.cannotEmail.length}
      >
        <CannotEmailTable rows={preview.cannotEmail} />
      </List>
    </section>
  )
}
