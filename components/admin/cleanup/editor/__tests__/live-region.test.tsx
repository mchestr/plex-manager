import { render, renderHook, screen } from "@testing-library/react"

import { buildPreview } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { CountRegion, countMessage, EditRegion, editKind, editMessage, kindOf, useEditMessage } from "@/components/admin/cleanup/editor/live-region"
import type { UndoRecord } from "@/lib/cleanup/editor/draft"

const TB = 1024 ** 4
const P191 = buildPreview({ matches: 191, bytes: String(Math.round(1.2 * TB)) })
const ROWS = { conditions: 4, protections: 1 }

describe("editMessage", () => {
  it("words add, remove and undo as UX 7.1 and 7.2 do, with sizes as words", () => {
    expect(editMessage({ kind: "added", what: "condition" }, P191, ROWS)).toBe("Condition added. 4 conditions. 191 matches, 1.2 terabytes.")
    expect(editMessage({ kind: "removed", what: "condition" }, buildPreview({ matches: 204 }), { conditions: 2, protections: 0 })).toBe(
      "Condition removed. 2 conditions. 204 matches."
    )
    expect(editMessage({ kind: "restored", what: "protection" }, buildPreview({ matches: 1 }), { conditions: 2, protections: 1 })).toBe(
      "Protection restored. 1 protection. 1 match."
    )
    expect(editMessage({ kind: "added", what: "group" }, buildPreview({ matches: 0, bytes: "0" }), { conditions: 1, protections: 0 })).toBe(
      "Any-of group added. 1 condition. 0 matches, 0 gigabytes."
    )
  })

  it("names the action and the row kind of each draft action", () => {
    const undo: UndoRecord = { removed: { id: "p2", field: "watch.plays", op: "atLeast", value: {} }, list: "protections", before: { conditions: [], protections: [] } }
    expect(editKind({ type: "remove", id: "a1" }, null)).toEqual({ kind: "removed", what: "group" })
    expect(editKind({ type: "undo" }, undo)).toEqual({ kind: "restored", what: "protection" })
    expect(editKind({ type: "undo" }, null)).toBeNull()
    expect(editKind({ type: "add", to: "protections" }, null)).toEqual({ kind: "added", what: "protection" })
    expect(editKind({ type: "add", to: "conditions" }, null)).toEqual({ kind: "added", what: "condition" })
    expect(editKind({ type: "addToGroup", groupId: "a1" }, null)).toEqual({ kind: "added", what: "condition" })
    expect(editKind({ type: "addGroup" }, null)).toEqual({ kind: "added", what: "group" })
    expect(editKind({ type: "duplicate", id: "p1" }, null)).toEqual({ kind: "added", what: "protection" })
    expect(editKind({ type: "ungroup", groupId: "a1" }, null)).toBeNull()
    expect(kindOf("c4")).toBe("condition")
  })
})

describe("useEditMessage", () => {
  it("speaks once the preview settles after the edit, while no editor is open, and keeps spoken words", () => {
    const before = buildPreview()
    const event = { seq: 1, kind: "added" as const, what: "condition" as const, previewAt: before }
    const { result, rerender } = renderHook((props: Parameters<typeof useEditMessage>[0]) => useEditMessage(props), {
      initialProps: { event, preview: before, updating: false, editing: false, rows: ROWS },
    })
    expect(result.current).toBe("")
    rerender({ event, preview: P191, updating: false, editing: true, rows: ROWS })
    expect(result.current).toBe("")
    rerender({ event, preview: P191, updating: true, editing: false, rows: ROWS })
    expect(result.current).toBe("")
    rerender({ event, preview: P191, updating: false, editing: false, rows: ROWS })
    expect(result.current).toBe("Condition added. 4 conditions. 191 matches, 1.2 terabytes.")
    rerender({ event, preview: buildPreview({ matches: 3 }), updating: false, editing: false, rows: ROWS })
    expect(result.current).toBe("Condition added. 4 conditions. 191 matches, 1.2 terabytes.")
  })

  it("renders the edit region as a polite atomic region", () => {
    render(<EditRegion text="Condition removed. 2 conditions. 204 matches." />)
    const region = screen.getByText("Condition removed. 2 conditions. 204 matches.")
    expect(region).toHaveAttribute("aria-live", "polite")
    expect(region).toHaveAttribute("aria-atomic", "true")
    expect(region).toHaveClass("sr-only")
  })
})

describe("CountRegion", () => {
  it("words the settled count with the delta", () => {
    expect(countMessage(buildPreview(), 6)).toBe("197 matches, 1.3 terabytes. 6 more than before.")
    expect(countMessage(buildPreview(), -2)).toBe("197 matches, 1.3 terabytes. 2 fewer than before.")
    expect(countMessage(buildPreview({ matches: 1 }), null)).toBe("1 match, 1.3 terabytes.")
  })

  it("keeps its words while updating or while an editor is open, then speaks the settled count once", () => {
    const { rerender } = render(<CountRegion preview={buildPreview()} updating={false} quiet={false} delta={null} />)
    const region = () => document.querySelector('[data-slot="count-region"]')
    expect(region()).toHaveTextContent("197 matches, 1.3 terabytes.")
    expect(region()).toHaveAttribute("aria-live", "polite")
    rerender(<CountRegion preview={P191} updating quiet={false} delta={-6} />)
    expect(region()).toHaveTextContent("197 matches, 1.3 terabytes.")
    rerender(<CountRegion preview={P191} updating={false} quiet delta={-6} />)
    expect(region()).toHaveTextContent("197 matches, 1.3 terabytes.")
    rerender(<CountRegion preview={P191} updating={false} quiet={false} delta={-6} className="custom" />)
    expect(region()).toHaveTextContent("191 matches, 1.2 terabytes. 6 fewer than before.")
    expect(region()).toHaveClass("custom")
  })
})
