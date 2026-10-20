import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"

import { PortalContainerProvider } from "@/components/ui/portal-container"
import type { CopyAuthor } from "@/lib/rewind/copy-disclosure"
import { registry, type IssuePageType, type PageTable } from "@/lib/rewind/registry"

import { StoryStage, type StoryStagePage } from "../story-stage"

export const TABLE: PageTable = {
  caption: "Hours by month, 1 January to 30 November 2026. Times in America/Chicago, the server's time zone",
  columns: ["Month", "Hours"],
  rows: [
    ["January", "42"],
    ["February", "38"],
  ],
}

/** Pages with a real `h2`, a control on Top shows, and a table on every chart page. */
export function stagePages(types: IssuePageType[]): StoryStagePage[] {
  return types.map((type) => ({
    type,
    content: (
      <div>
        <h2 tabIndex={-1}>{`Heading of ${type}`}</h2>
        {type === "top-shows" && <button type="button">Show all</button>}
      </div>
    ),
    table: registry[type].table ? TABLE : null,
  }))
}

export const LLM_COPY: CopyAuthor = { copySource: "llm", model: "anthropic:claude-sonnet-5-5" }

/** Renders the stage inside a Rewind scope whose popups print on paper, as P5.1's layout does. */
export function renderStage(types: IssuePageType[], { copy = LLM_COPY, wrap }: { copy?: CopyAuthor; wrap?: (stage: ReactNode) => ReactNode } = {}) {
  const stage = <StoryStage pages={stagePages(types)} year={2026} archetype="midnight-marathoner" closeHref="/home" copy={copy} />
  return render(
    <div data-theme="rewind">
      <PortalContainerProvider popupProps={{ "data-field": "paper" }}>{wrap ? wrap(stage) : stage}</PortalContainerProvider>
    </div>
  )
}

export const stage = () => screen.getByTestId("rewind-stage")
export const currentPage = () => screen.getAllByTestId("rewind-page").find((page) => page.hasAttribute("data-current"))
