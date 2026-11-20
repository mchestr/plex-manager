import Link from "next/link"
import type { Route } from "next"

import { type CheckContext, type CheckFix, checkWords, LISTED } from "@/components/admin/cleanup/turn-on/check-words"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import type { TurnOnCheck } from "@/lib/cleanup/types/rule-parts"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/** The icon, its colour and its spoken word for each state (UX 4.6: success, warning or destructive, and info). */
const STATES = {
  ok: { icon: icons.success, className: "text-success", label: "Passed" },
  warning: { icon: icons.warning, className: "text-warning", label: "Warning" },
  failed: { icon: icons.error, className: "text-destructive", label: "Failed" },
  info: { icon: icons.info, className: "text-info", label: "Note" },
} as const

const LINK = "rounded-sm font-medium text-foreground underline decoration-border-strong underline-offset-3 hover:decoration-foreground"

/** A check id in a test id, in kebab case as UX 10.1 item 2 asks: `featureOn` gives `feature-on`. */
const kebabId = (id: string) => id.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()

/** The "Open settings" link of the feature check in the Ready card has its own id (UX 10.2). */
const SETTINGS_LINK_ID = "admin-cleanup-turn-on-settings-link"

/** The id of a check's text in the card, for the button's `aria-describedby` (UX 4.6 right column item 1.1). */
export const checkTextId = (idBase: string, check: TurnOnCheck): string => `${idBase}-check-${check.id}-text`

function FixLink({ fix, testId }: { fix: CheckFix; testId: string }) {
  if (fix.external) {
    return (
      <a href={fix.href} target="_blank" rel="noopener noreferrer" aria-label={`${fix.label}, opens in a new tab`} className={LINK} data-testid={testId}>
        {fix.label}
      </a>
    )
  }
  return (
    <Link href={fix.href as Route} className={LINK} data-testid={testId}>
      {fix.label}
    </Link>
  )
}

interface CheckLineProps {
  check: TurnOnCheck
  ctx: CheckContext
  /** `admin-cleanup-turn-on-check-{id}` or `admin-cleanup-turn-on-top-check-{id}`, the id in kebab case. */
  testId: string
  /** The fix link's id, when not `{testId}-fix`. */
  fixId?: string
  textId?: string
}

function CheckLine({ check, ctx, testId, fixId, textId }: CheckLineProps) {
  const { text, fix } = checkWords(check, ctx)
  const state = STATES[check.state]
  return (
    <li className="flex items-start gap-2.5 py-2.5 text-ui first:pt-0 last:pb-0" data-state={check.state} data-testid={testId}>
      <Icon icon={state.icon} label={state.label} className={cn("mt-0.5", state.className)} />
      <p className="min-w-0 flex-1 text-foreground">
        <span id={textId}>{text}</span>
        {fix && (
          <>
            {" "}
            <FixLink fix={fix} testId={fixId ?? `${testId}-fix`} />
          </>
        )}
      </p>
    </li>
  )
}

interface ReadyChecksProps {
  checks: readonly TurnOnCheck[]
  ctx: CheckContext
  /** The `useId()` of the view: a kept route can hold a second copy of the page. */
  idBase: string
}

/**
 * "Ready to turn on" (UX 4.6 right column item 1, 7.13): one line for each
 * check, with an icon and its text in every state. A check that fails names
 * its fix with a link. The feature-off fix opens Settings with `returnTo`
 * this page (TS 12.7 item 10).
 */
export function ReadyChecks({ checks, ctx, idBase }: ReadyChecksProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Ready to turn on</CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <ul className="flex flex-col divide-y">
          {checks.filter(LISTED).map((check) => (
            <CheckLine
              key={check.id}
              check={check}
              ctx={ctx}
              testId={`admin-cleanup-turn-on-check-${kebabId(check.id)}`}
              fixId={check.id === "featureOn" ? SETTINGS_LINK_ID : undefined}
              textId={checkTextId(idBase, check)}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/**
 * The checks that stop a press, again at the top of the page below `lg`,
 * where the right column moves to the end (UX 4.6 behaviour item 6). This
 * copy has its own ids: `admin-cleanup-turn-on-top-check-{checkId}` and
 * `-fix` (UX 10.2), the check id in kebab case.
 */
export function TopChecks({ checks, ctx }: { checks: readonly TurnOnCheck[]; ctx: CheckContext }) {
  if (checks.length === 0) return null
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/8 p-3 lg:hidden" data-testid="admin-cleanup-turn-on-top-checks">
      <ul className="flex flex-col divide-y divide-destructive/20">
        {checks.map((check) => (
          <CheckLine key={check.id} check={check} ctx={ctx} testId={`admin-cleanup-turn-on-top-check-${kebabId(check.id)}`} />
        ))}
      </ul>
    </div>
  )
}
