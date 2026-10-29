import { Network } from "lucide-react"

import { EmptyState } from "@/components/ui/empty-state"
import type { TreeNode } from "@/lib/admin/affiliates/rows"
import type { BoundFormat } from "@/lib/utils/format"

function Branch({ node, f, depth }: { node: TreeNode; f: BoundFormat; depth: number }) {
  const removed = depth === 0 ? "A removed member" : "a removed member"
  const testId = node.userId ? `admin-affiliates-tree-node-${node.userId}` : depth === 0 ? "admin-affiliates-tree-removed-root" : "admin-affiliates-tree-removed"
  return (
    <li className="flex flex-col gap-1" data-testid={testId}>
      <span className="text-ui">
        <span className={node.userId ? "font-medium" : "text-muted-foreground"}>{node.name ?? removed}</span>
        {node.joinedAt && <span className="text-muted-foreground">, joined {f.date(node.joinedAt)}</span>}
      </span>
      {node.children.length > 0 && (
        <ul className="ml-4 flex flex-col gap-1 border-l pl-4" aria-label={`Invited by ${node.name ?? "a removed member"}`}>
          {node.children.map((child, index) => (
            <Branch key={child.userId ?? `removed-${depth}-${index}`} node={child} f={f} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** Each affiliate with the people they invited, nested where an invitee also invited people. */
export function InviteTree({ roots, f }: { roots: TreeNode[]; f: BoundFormat }) {
  if (roots.length === 0) {
    return <EmptyState kind="first-use" icon={Network} title="Nobody joined through an affiliate invite yet" data-testid="admin-affiliates-tree-empty" />
  }
  return (
    <ul className="flex flex-col gap-4 rounded-lg border bg-card p-4" data-testid="admin-affiliates-tree">
      {roots.map((root) => (
        <Branch key={root.userId ?? "removed"} node={root} f={f} depth={0} />
      ))}
    </ul>
  )
}
