import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { UndoLine, undoText } from "@/components/admin/cleanup/editor/undo-line"
import type { UndoRecord } from "@/lib/cleanup/editor/draft"

expect.extend(toHaveNoViolations)

const PLAYS = { id: "p1", field: "watch.plays" as const, op: "atLeast", value: { count: 3, window: { kind: "total" } } }
const RECORD: UndoRecord = { removed: PLAYS, list: "protections", before: { conditions: [], protections: [PLAYS] } }

describe("UndoLine", () => {
  it("reads Condition removed: {sentence}. with Undo, and no timer", async () => {
    jest.useFakeTimers()
    const onUndo = jest.fn()
    const { container } = render(<UndoLine undo={RECORD} level="movie" onUndo={onUndo} />)
    expect(screen.getByTestId("admin-cleanup-undo-p1")).toHaveTextContent("Condition removed: Plays at least 3 in total.")
    jest.advanceTimersByTime(60 * 60 * 1000)
    expect(screen.getByTestId("admin-cleanup-undo-p1")).toBeInTheDocument()
    jest.useRealTimers()
    await userEvent.click(screen.getByTestId("admin-cleanup-undo-p1-button"))
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("words a removed group and a member name", () => {
    const group = {
      id: "a1",
      kind: "anyOf" as const,
      conditions: [
        { id: "c3", field: "request.exists" as const, op: "is", value: { exists: false } },
        { id: "c4", field: "request.by" as const, op: "anyOf", value: { requesters: [{ kind: "member", userId: "u1" }] } },
      ],
    }
    const record: UndoRecord = { removed: group, list: "conditions", before: { conditions: [group], protections: [] } }
    expect(undoText(record, "movie", { memberName: () => "Robin Vale" })).toBe(
      "Any-of group removed: Requested in Overseerr: no, or Requested by any of Robin Vale."
    )
  })
})
