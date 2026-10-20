import type { BookendsData } from "@/lib/rewind/pages/bookends.schema"
import type { CoverData } from "@/lib/rewind/pages/cover.schema"
import type { NumberData } from "@/lib/rewind/pages/number.schema"
import { registry, type RegistryEntry } from "@/lib/rewind/registry"
import type { SelectedPage } from "@/lib/rewind/select-pages"

import { BookendsPage } from "./bookends"
import { CoverPage } from "./cover"
import type { IssueContext } from "./issue-context"
import { NumberPage } from "./number"
import { u } from "./units"

/**
 * The body of one selected page. `data` has passed the page's registry
 * schema (`validatePagesOnRead`), so each branch may narrow it. Pages whose
 * steps have not landed (P5.6, P5.7) print their name and summary.
 */
export function PageBody({ page, issue }: { page: SelectedPage; issue: IssueContext }) {
  switch (page.type) {
    case "cover":
      return <CoverPage data={page.data as CoverData} issue={issue} />
    case "number":
      return <NumberPage data={page.data as NumberData} issue={issue} />
    case "bookends":
      return <BookendsPage data={page.data as BookendsData} issue={issue} />
    default: {
      const entry: RegistryEntry = registry[page.type]
      return (
        <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)}`, gap: u(12) }}>
          <h2 tabIndex={-1} className="font-lead outline-none" style={{ fontSize: u(36) }}>
            {entry.name}
          </h2>
          <p style={{ fontSize: u(18.5) }}>{entry.srSummary(page.data, issue.facts)}</p>
        </div>
      )
    }
  }
}
