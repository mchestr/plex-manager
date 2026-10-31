import { X } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { auditLog } from "@/lib/admin/routes"
import type { AuditParty } from "@/lib/data/audit-log"
import { tableHref } from "@/lib/ui/table-params"

type Params = Record<string, string | string[] | undefined>

interface AuditScopeProps {
  /** The page's search params; each remove link keeps the others. */
  params: Params
  actor: AuditParty | null
  member: AuditParty | null
  /** An inactivity run id. */
  run: string | null
}

/**
 * What the log is limited to beyond the filter bar: one person's actions,
 * the events involving a member, or one inactivity run, each with a link
 * that removes it and keeps every other filter.
 */
export function AuditScope({ params, actor, member, run }: AuditScopeProps) {
  const scopes: { key: "actor" | "member" | "run"; text: string }[] = []
  if (actor) scopes.push({ key: "actor", text: `By ${actor.name}` })
  if (member) scopes.push({ key: "member", text: `Involving ${member.name}` })
  if (run) scopes.push({ key: "run", text: "One inactivity run" })
  if (scopes.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="admin-audit-scope">
      {scopes.map(({ key, text }) => (
        <span
          key={key}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border-strong pr-1 pl-2.5 text-label text-foreground"
          data-testid={`admin-audit-scope-${key}`}
        >
          {text}
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            nativeButton={false}
            render={<Link href={tableHref(auditLog(), params, { [key]: null, page: null })} />}
            aria-label={`Remove "${text}"`}
            data-testid={`admin-audit-scope-${key}-clear`}
          >
            <Icon icon={X} size={14} />
          </Button>
        </span>
      ))}
    </div>
  )
}
