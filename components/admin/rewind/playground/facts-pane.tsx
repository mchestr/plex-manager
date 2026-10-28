"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { ListX } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import type { PlaygroundView } from "@/lib/rewind/playground/view"

type Fact = PlaygroundView["facts"][number]

const columns: ColumnDef<Fact>[] = [
  {
    id: "id",
    header: "Fact id",
    accessorKey: "id",
    cell: ({ row }) => <code className="font-mono text-label">{row.original.id}</code>,
    meta: { card: "title" },
  },
  { id: "display", header: "Display", accessorKey: "display", meta: { card: "sub" } },
]

interface FactsPaneProps {
  view: Pick<PlaygroundView, "facts" | "titles" | "pages" | "omitted" | "edition" | "archetype">
}

/** The fact sheet the model saw, then the pages the run printed and why each omitted one went. */
export function FactsPane({ view }: FactsPaneProps) {
  const titles = new Set(view.titles)
  return (
    <section aria-labelledby="playground-facts" className="flex flex-col gap-6" data-testid="playground-facts">
      <div className="flex flex-col gap-3">
        <h2 id="playground-facts" className="text-h3 font-semibold text-foreground">
          Fact sheet
        </h2>
        <DataTable
          columns={[
            ...columns,
            {
              id: "kind",
              header: "Kind",
              cell: ({ row }) => (titles.has(row.original.display) ? <Badge variant="info">Title</Badge> : null),
              meta: { card: "sub" },
            },
          ]}
          data={view.facts}
          getRowId={(fact) => fact.id}
          label="Fact sheet"
          noun="facts"
          pagination={{ page: 1, pageSize: Math.max(view.facts.length, 1), total: view.facts.length }}
          empty={<EmptyState kind="first-use" icon={ListX} title="No facts" description="The selected slots cite no facts." />}
          data-testid="playground-fact-table"
        />
      </div>
      <div className="flex flex-col gap-3" data-testid="playground-selection">
        <h3 className="text-ui font-semibold text-foreground">
          Pages: {view.pages.length} printed, {view.edition} edition{view.archetype ? `, ${view.archetype}` : ""}
        </h3>
        <ol className="flex flex-wrap gap-1.5">
          {view.pages.map((page) => (
            <li key={page.type} data-testid={`playground-page-${page.type}`}>
              <Badge variant="outline">{page.name}</Badge>
            </li>
          ))}
        </ol>
        {view.omitted.length > 0 ? (
          <ul className="flex flex-col gap-1 text-ui">
            {view.omitted.map((page) => (
              <li key={page.folio} data-testid={`playground-omitted-${page.type}`}>
                <span className="font-medium text-foreground">
                  {page.folio}. {page.name}
                </span>
                <span className="text-muted-foreground">: {page.reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ui text-muted-foreground">No page was omitted.</p>
        )}
      </div>
    </section>
  )
}
