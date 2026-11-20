import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useReducer } from "react"

import type { RowKit } from "@/components/admin/cleanup/editor/condition-box"
import { ConditionsFieldset } from "@/components/admin/cleanup/editor/conditions-fieldset"
import { ProtectionsFieldset } from "@/components/admin/cleanup/editor/protections-fieldset"
import { draftReducer, initDraftState } from "@/lib/cleanup/editor/draft"
import { flatConditions } from "@/lib/cleanup/editor/tree"
import type { EditorGlobalProtection } from "@/lib/cleanup/types/rule-parts"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

expect.extend(toHaveNoViolations)

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

const DRAFT: RuleDraft = {
  schemaVersion: 1,
  level: "movie",
  libraries: ["1"],
  conditions: [
    { id: "c1", field: "library.added", op: "moreThan", value: { duration: { amount: 365, unit: "days" } } },
    { id: "c2", field: "watch.lastPlayed", op: "moreThan", value: { duration: { amount: 365, unit: "days" }, orNever: true } },
  ],
  protections: [{ id: "p1", field: "watch.plays", op: "atLeast", value: { count: 3, window: { kind: "total" } } }],
  then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
}

const GLOBALS: EditorGlobalProtection[] = [
  { id: "g1", sentence: "Kept by a member, until the Keep ends", enabled: true, appliesToLevel: true },
  { id: "g4", sentence: "Played by anyone in the last 30 days", enabled: true, appliesToLevel: true },
]

function kitFor(draft: RuleDraft, onAction: RowKit["onAction"]): RowKit {
  return {
    level: draft.level,
    words: { memberName: () => null },
    saved: null,
    errors: new Map(),
    held: new Map(),
    keeps: new Map([["p1", 7]]),
    failed: new Map(),
    historyStart: null,
    zone: "UTC",
    open: null,
    targets: [],
    conditionCount: flatConditions(draft.conditions).length,
    onOpen: jest.fn(),
    onAction,
  }
}

/** Both lists over the real draft reducer, so rows can move between them. */
function Live({ start = DRAFT }: { start?: RuleDraft }) {
  const [state, dispatch] = useReducer(draftReducer, initDraftState(start, "Old films"))
  const kit = kitFor(state.draft, dispatch)
  return (
    <>
      <ConditionsFieldset clauses={state.draft.conditions} kit={kit} undo={state.undo} />
      <ProtectionsFieldset protections={state.draft.protections} kit={kit} undo={state.undo} globals={GLOBALS} counts={kit.keeps} kept={17} />
    </>
  )
}

const tid = (id: string) => screen.getByTestId(id)

describe("ProtectionsFieldset", () => {
  it("is the Never touch part with its note, the global line, This rule only, the rows and Add protection", async () => {
    const { container } = render(<Live />)
    const part = screen.getByRole("group", { name: "Never touch" })
    expect(part).toHaveAccessibleDescription("If any of these is true, the movie is safe.")
    expect(within(part).getByTestId("admin-cleanup-global-protections")).toHaveTextContent("Always on: 2 global protections keep 17 movies safe.")
    expect(within(part).getByText("This rule only")).toBeInTheDocument()
    expect(within(part).getByRole("toolbar", { name: "Protection 1 of 1: Plays at least 3 in total." })).toBeInTheDocument()
    expect(tid("admin-cleanup-protection-p1-held")).toHaveTextContent("keeps 7 safe")
    expect(tid("admin-cleanup-add-protection").className).toContain("max-md:w-full")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("adds protections joined with or, and hides This rule only with none", async () => {
    const user = userEvent.setup()
    render(<Live start={{ ...DRAFT, protections: [] }} />)
    expect(screen.queryByText("This rule only")).toBeNull()
    await user.click(tid("admin-cleanup-add-protection"))
    await user.click(tid("admin-cleanup-add-protection"))
    expect(screen.getByText("This rule only")).toBeInTheDocument()
    expect(within(tid("admin-cleanup-protection-p2")).getByText("or")).toBeInTheDocument()
    expect(tid("admin-cleanup-protection-p1")).toHaveAccessibleName("Protection 1 of 2: Added more than 90 days ago.")
  })

  it("turns a condition into a protection and back, with the same values", async () => {
    const user = userEvent.setup()
    render(<Live />)
    await user.click(tid("admin-cleanup-condition-c2-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-condition-c2-menu-protection"))
    expect(screen.queryByTestId("admin-cleanup-condition-c2")).toBeNull()
    expect(tid("admin-cleanup-protection-p2")).toHaveAccessibleName("Protection 2 of 2: Last played more than 365 days ago, or never.")
    await user.click(tid("admin-cleanup-protection-p2-menu"))
    await user.click(await screen.findByTestId("admin-cleanup-protection-p2-menu-condition"))
    expect(screen.queryByTestId("admin-cleanup-protection-p2")).toBeNull()
    expect(tid("admin-cleanup-condition-c3")).toHaveAccessibleName("Condition 2 of 2: Last played more than 365 days ago, or never.")
  })

  it("removes a protection with an Undo line in its place", async () => {
    const user = userEvent.setup()
    render(<Live start={{ ...DRAFT, protections: [...DRAFT.protections, { ...DRAFT.protections[0], id: "p2" }] }} />)
    await user.click(tid("admin-cleanup-protection-p1-remove"))
    const part = screen.getByRole("group", { name: "Never touch" })
    const order = Array.from(part.querySelectorAll('[data-slot="condition-row"], [data-testid="admin-cleanup-undo-p1"]'), (el) => el.getAttribute("data-row") ?? "undo")
    expect(order).toEqual(["undo", "p2"])
    expect(tid("admin-cleanup-undo-p1")).toHaveTextContent("Condition removed: Plays at least 3 in total.")
    await user.click(tid("admin-cleanup-undo-p1-button"))
    expect(tid("admin-cleanup-protection-p1")).toBeInTheDocument()
  })

  it("names the item by the level in its note, and disables Add protection at 10", () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...DRAFT.protections[0], id: `p${i + 1}` }))
    render(<Live start={{ ...DRAFT, level: "show", protections: ten }} />)
    expect(screen.getByRole("group", { name: "Never touch" })).toHaveAccessibleDescription("If any of these is true, the show is safe.")
    expect(tid("admin-cleanup-add-protection")).toBeDisabled()
  })
})
