import { act, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useReducer } from "react"

import { BuilderForm } from "@/components/admin/cleanup/editor/builder-form"
import { boxName, ConditionBox, type RowKit, rowView } from "@/components/admin/cleanup/editor/condition-box"
import { ConditionRow } from "@/components/admin/cleanup/editor/condition-row"
import { buildPreview } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { draftReducer, initDraftState } from "@/lib/cleanup/editor/draft"
import type { CleanupEditorData } from "@/lib/cleanup/types/screens"
import type { DraftCondition, RuleDraft } from "@/lib/validations/cleanup-draft"

expect.extend(toHaveNoViolations)

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

// Invented rule data.
const LAST_PLAYED: DraftCondition = {
  id: "c2",
  field: "watch.lastPlayed",
  op: "moreThan",
  value: { duration: { amount: 365, unit: "days" }, orNever: true },
}
const DRAFT: RuleDraft = {
  schemaVersion: 1,
  level: "movie",
  libraries: ["1"],
  conditions: [
    { id: "c1", field: "library.added", op: "moreThan", value: { duration: { amount: 365, unit: "days" } } },
    LAST_PLAYED,
    { id: "c3", field: "request.exists", op: "is", value: { exists: false } },
    { id: "c4", field: "watch.lastPlayed", op: "never", value: { duration: { amount: 365, unit: "days" }, orNever: true } },
  ],
  protections: [{ id: "p1", field: "watch.plays", op: "atLeast", value: { count: 3, window: { kind: "total" } } }],
  then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
}

const DATA: CleanupEditorData = {
  rule: { id: "rule-1", name: "Old films", mode: "dryRun", revision: 1, definition: DRAFT, turnedOnAt: null, lastDryRun: null },
  fields: [],
  libraries: [{ sectionId: "1", title: "Films", level: "movie", arr: "radarr", disabledReason: null }],
  globalProtections: [],
  requesterOptions: [],
  options: { automaticMinGraceDays: 7, defaults: { graceDays: 30, importListExclusion: true } },
  importListCount: null,
  zone: "UTC",
  initialPreview: buildPreview(),
}

const PREVIEW = buildPreview({
  clauses: [{ id: "c2", passAlone: 478, heldBack: 13 }],
  protectedBy: [{ protectionId: "p1", count: 7 }],
})

function Phone() {
  const [state, dispatch] = useReducer(draftReducer, initDraftState(DRAFT, "Old films"))
  return (
    <BuilderForm
      draft={state}
      dispatch={dispatch}
      editorData={DATA}
      preview={PREVIEW}
      updating={false}
      mode="dryRun"
      isLive={false}
      errors={[]}
      onOpenRecipe={jest.fn()}
    />
  )
}

const original = { matchMedia: window.matchMedia, checkVisibility: HTMLElement.prototype.checkVisibility }

/** A 390 px screen: the Sheet shell, and the desktop toolbars hidden as their `md:flex` class would. */
function usePhone() {
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    HTMLElement.prototype.checkVisibility = function (this: HTMLElement) {
      return !this.closest('[data-layout="desktop"]')
    }
  })
  afterEach(() => {
    window.matchMedia = original.matchMedia
    HTMLElement.prototype.checkVisibility = original.checkVisibility
  })
}

function kit(overrides: Partial<RowKit> = {}): RowKit {
  return {
    level: "movie",
    words: { memberName: () => null },
    saved: null,
    errors: new Map(),
    held: new Map([["c2", 13]]),
    keeps: new Map([["p1", 7]]),
    failed: new Map(),
    historyStart: null,
    zone: "UTC",
    open: null,
    targets: [],
    conditionCount: 3,
    onOpen: jest.fn(),
    onAction: jest.fn(),
    ...overrides,
  }
}

/**
 * Picks a target of the group-with submenu by keyboard, as a pointer pick
 * races Base UI's guard against a release on an item that just opened.
 */
async function pickGroupTarget(user: ReturnType<typeof userEvent.setup>, triggerId: string, index: number) {
  act(() => screen.getByTestId(triggerId).focus())
  await user.keyboard("{Enter}")
  await screen.findByTestId(`${triggerId}-duplicate`)
  await user.keyboard("{ArrowDown}{ArrowRight}")
  await screen.findByText("Group with")
  await user.keyboard(`${"{ArrowDown}".repeat(index)}{Enter}`)
}

const tid = (id: string) => screen.getByTestId(id)
const sheet = () => screen.queryByTestId("admin-cleanup-condition-editor")

describe("ConditionBox", () => {
  it("is one button named by its sentence, held-back text and place, with static parts and no nested button", async () => {
    const onPress = jest.fn()
    const view = rowView(LAST_PLAYED, { n: 2, total: 3 }, kit())
    const { container } = render(<ConditionBox view={view} onPress={onPress} />)
    const box = tid("admin-cleanup-condition-c2-box")
    expect(box).toHaveAccessibleName("Last played more than 365 days ago, or never. 13 more without it. Change condition 2 of 3.")
    expect(box.tagName).toBe("BUTTON")
    expect(within(box).queryAllByRole("button")).toHaveLength(0)
    expect(box.querySelectorAll("button")).toHaveLength(0)
    for (const part of ["field", "operator", "value"]) {
      expect(tid(`admin-cleanup-condition-c2-box-${part}`)).toHaveAttribute("data-state", "static")
    }
    expect(tid("admin-cleanup-condition-c2-box-held")).toHaveTextContent("13 more without it")
    await userEvent.click(box)
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(await axe(container, { rules: { "nested-interactive": { enabled: true } } })).toHaveNoViolations()
  })

  it("keeps its visible words apart, so its name holds the visible text (SC 2.5.3)", async () => {
    const view = rowView(LAST_PLAYED, { n: 2, total: 3 }, kit())
    const { container } = render(<ConditionBox view={view} onPress={jest.fn()} />)
    const box = tid("admin-cleanup-condition-c2-box")
    const words = (text: string) => text.replace(/[.,]/g, "").split(/\s+/).filter(Boolean).join(" ")
    expect(words(box.textContent ?? "")).toBe("Last played more than 365 days ago or never 13 more without it")
    expect(words(box.getAttribute("aria-label") ?? "")).toContain(words(box.textContent ?? ""))
    expect(await axe(container, { rules: { "label-content-name-mismatch": { enabled: true } } })).toHaveNoViolations()
  })

  it("names a protection box, and a group member's box by its place in the group", () => {
    const protection = rowView(DRAFT.protections[0], { n: 1, total: 1 }, kit())
    expect(boxName(protection)).toBe("Plays at least 3 in total. Keeps 7 safe. Change protection 1 of 1.")
    const member = rowView(DRAFT.conditions[2] as DraftCondition, { n: 3, total: 4, inGroup: true }, kit())
    expect(boxName(member)).toBe("Requested in Overseerr: no. Change condition 3 of 4 in the any-of group.")
  })

  it("shares no test id with the desktop row of the same condition", () => {
    const { container } = render(<ConditionRow condition={LAST_PLAYED} position={{ n: 2, total: 3 }} gutter="and" kit={kit()} />)
    const ids = Array.from(container.querySelectorAll("[data-testid]")).map((el) => el.getAttribute("data-testid"))
    expect(new Set(ids).size).toBe(ids.length)
    const box = tid("admin-cleanup-condition-c2-box")
    const boxIds = Array.from(box.querySelectorAll("[data-testid]"), (el) => el.getAttribute("data-testid"))
    const rowIds = Array.from(tid("admin-cleanup-condition-c2").querySelectorAll("[data-testid]"), (el) => el.getAttribute("data-testid"))
    expect(boxIds.filter((id) => rowIds.includes(id))).toEqual([])
  })
})

describe("ConditionBox on a phone", () => {
  usePhone()

  it("opens the condition Sheet with focus in the value input, and returns focus to the box", async () => {
    const user = userEvent.setup()
    render(<Phone />)
    await user.click(tid("admin-cleanup-condition-c2-box"))
    await waitFor(() => expect(sheet()).toHaveAttribute("data-shell", "sheet"))
    await waitFor(() => expect(tid("admin-cleanup-condition-editor-number")).toHaveFocus())
    expect(within(sheet() as HTMLElement).getByTestId("admin-cleanup-condition-editor-menu")).toHaveAccessibleName("More actions for this condition")
    await user.click(tid("admin-cleanup-condition-editor-done"))
    await waitFor(() => expect(sheet()).toBeNull())
    await waitFor(() => expect(tid("admin-cleanup-condition-c2-box")).toHaveFocus())
  })

  it("falls back to the checked radio of a choice value, and to the operator with Never", async () => {
    const user = userEvent.setup()
    render(<Phone />)
    await user.click(tid("admin-cleanup-condition-c3-box"))
    await waitFor(() => expect(tid("admin-cleanup-condition-editor-choice-no")).toHaveFocus())
    await user.click(tid("admin-cleanup-condition-editor-close"))
    await waitFor(() => expect(sheet()).toBeNull())

    await user.click(tid("admin-cleanup-condition-c4-box"))
    await waitFor(() => expect(tid("admin-cleanup-condition-editor-operator-never")).toHaveFocus())
  })

  it("applies a Sheet header menu item, closes the Sheet and focuses the box of the new row after Duplicate", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Phone />)
    await user.click(tid("admin-cleanup-condition-c2-box"))
    await waitFor(() => expect(sheet()).not.toBeNull())
    await user.click(tid("admin-cleanup-condition-editor-menu"))
    expect(await screen.findByTestId("admin-cleanup-condition-editor-menu-group")).toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-condition-editor-menu-remove")).toBeNull()
    await user.click(screen.getByTestId("admin-cleanup-condition-editor-menu-duplicate"))
    await waitFor(() => expect(sheet()).toBeNull())
    expect(tid("admin-cleanup-condition-c5-box")).toHaveAccessibleName(/^Last played more than 365 days ago, or never\. Change condition 3 of 5\.$/)
    await waitFor(() => expect(tid("admin-cleanup-condition-c5-box")).toHaveFocus())
  })

  it("moves a row into a group from the Sheet menu, and focuses the moved box", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Phone />)
    await user.click(tid("admin-cleanup-condition-c2-box"))
    await waitFor(() => expect(sheet()).not.toBeNull())
    await pickGroupTarget(user, "admin-cleanup-condition-editor-menu", 0)
    await waitFor(() => expect(sheet()).toBeNull())
    expect(within(tid("admin-cleanup-group-a1")).getByTestId("admin-cleanup-condition-c2-box")).toBeInTheDocument()
    await waitFor(() => expect(tid("admin-cleanup-condition-c2-box")).toHaveFocus())
  })

  it("removes the row from the Sheet footer and focuses the next box", async () => {
    const user = userEvent.setup()
    render(<Phone />)
    await user.click(tid("admin-cleanup-condition-c2-box"))
    await waitFor(() => expect(sheet()).not.toBeNull())
    await user.click(tid("admin-cleanup-condition-editor-remove"))
    await waitFor(() => expect(sheet()).toBeNull())
    expect(screen.queryByTestId("admin-cleanup-condition-c2-box")).toBeNull()
    await waitFor(() => expect(tid("admin-cleanup-condition-c3-box")).toHaveFocus())
  })
})
