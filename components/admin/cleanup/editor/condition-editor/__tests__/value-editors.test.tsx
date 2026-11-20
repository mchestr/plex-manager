import { screen, waitFor, within } from "@testing-library/react"
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import type { RequesterOption } from "@/lib/cleanup/types/rule-parts"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"
import { GiB, TiB } from "@/lib/validations/cleanup-vocabulary"

import { calls, FOCUS, id, number, openEditor, useViewport } from "./editor-harness"

expect.extend(toHaveNoViolations)

useViewport()

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockClear()
})

const lastDraft = () => calls.onDraftChange.mock.lastCall?.[0] as DraftCondition

describe("SizeInput", () => {
  const SIZE: DraftCondition = { id: "c3", field: "file.size", op: "moreThan", value: { bytes: 20 * GiB, unit: "GB" } }
  const focus = {
    matches: 9,
    data: {
      presets: [
        { value: 10 * GiB, label: "10 GB", matches: 41 },
        { value: 20 * GiB, label: "20 GB", matches: 9 },
        { value: 50 * GiB, label: "50 GB", matches: 0 },
      ],
      buckets: [
        { label: "Under 2 GB", count: 120, passes: false },
        { label: "2 to 5 GB", count: 286, passes: false },
        { label: "5 to 10 GB", count: 251, passes: false },
        { label: "10 to 20 GB", count: 96, passes: false },
        { label: "20 to 40 GB", count: 24, passes: false },
        { label: "40 GB or more", count: 0, passes: true },
      ],
      summary: "9 of 777 movies pass this condition.",
      libraryHint: "Your movies: median 4.8 GB, largest 29.8 GB.",
    },
  }

  it("shows GB or TB, the presets of the level with counts, the hint and the histogram", async () => {
    await openEditor({ condition: SIZE, focus })
    expect(number()).toHaveValue("20")
    expect(number()).toHaveAccessibleName("Size, in GB")
    expect(screen.getByTestId(id("unit-gb"))).toHaveAttribute("aria-checked", "true")
    expect(screen.getByTestId(id("preset-20-gb"))).toHaveAttribute("aria-checked", "true")
    expect(screen.getByTestId(id("preset-50-gb"))).toHaveAccessibleName("50 GB, 0 matches")
    expect(screen.getByText("Your movies: median 4.8 GB, largest 29.8 GB.")).toBeVisible()
    expect(within(screen.getByTestId(id("histogram"))).getByText("Movies by size")).toBeVisible()
    expect(screen.queryByText("Played before Nov 8, 2025, server time (UTC).")).toBeNull()
  })

  it("keeps the number when the unit changes, stores bytes, and a preset sets GB", async () => {
    const { user } = await openEditor({ condition: SIZE, focus })
    await user.click(screen.getByTestId(id("unit-tb")))
    expect(lastDraft().value).toEqual({ bytes: 20 * TiB, unit: "TB" })
    expect(number()).toHaveAccessibleName("Size, in TB")
    await user.clear(number())
    await user.type(number(), "1.5")
    await waitFor(() => expect(lastDraft().value).toEqual({ bytes: 1.5 * TiB, unit: "TB" }), { timeout: 1500 })

    await user.click(screen.getByTestId(id("preset-10-gb")))
    expect(lastDraft().value).toEqual({ bytes: 10 * GiB, unit: "GB" })
  })

  it("checks the size on blur: 'Enter a size from 1 GB to 50 TB.'", async () => {
    const { user } = await openEditor({ condition: SIZE, focus })
    await user.clear(number())
    await user.type(number(), "0.5")
    await user.tab()
    expect(await screen.findByTestId(id("error"))).toHaveTextContent("Enter a size from 1 GB to 50 TB.")
    expect(number()).toHaveAttribute("aria-invalid", "true")
  })
})

describe("CountInput", () => {
  const PLAYS: DraftCondition = { id: "c1", field: "watch.plays", op: "fewerThan", value: { count: 1, window: { kind: "total" } } }

  it("reads 'play' at one, takes the presets, and opens a window of the last 365 days", async () => {
    const { user } = await openEditor({ condition: PLAYS, focus: { matches: 31 } })
    expect(screen.getByText("play")).toBeVisible()
    expect(screen.getByTestId(id("window"))).toHaveTextContent("in total")
    await user.click(screen.getByTestId(id("preset-3")))
    expect(lastDraft().value).toEqual({ count: 3, window: { kind: "total" } })
    expect(screen.getByText("plays")).toBeVisible()

    await user.click(screen.getByTestId(id("window")))
    await user.click(await screen.findByTestId(id("window-option-last")))
    expect(lastDraft().value).toEqual({ count: 3, window: { kind: "last", duration: { amount: 365, unit: "days" } } })
    expect(screen.getByTestId(id("window-number"))).toHaveValue("365")
    expect(screen.getByTestId(id("window-unit"))).toHaveTextContent("days")

    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    await user.click(screen.getByTestId(id("window")))
    // Base UI holds pointer events off a list that opens over the last one; a person moves the pointer first.
    await userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never }).click(await screen.findByTestId(id("window-option-total")))
    expect(lastDraft().value).toEqual({ count: 3, window: { kind: "total" } })
  })

  it("sends a typed count after the debounce, and checks it on blur", async () => {
    const { user } = await openEditor({ condition: PLAYS, focus: { matches: 31 } })
    await user.clear(number())
    await user.type(number(), "2")
    await waitFor(() => expect(lastDraft().value).toEqual({ count: 2, window: { kind: "total" } }), { timeout: 1500 })
    await user.clear(number())
    await user.tab()
    expect(await screen.findByTestId(id("error"))).toHaveTextContent("Enter a whole number of plays from 1 to 1000.")
  })

  it("puts a count error on the count, and a window error on the window", async () => {
    const plays = { ...PLAYS, value: { count: 0, window: { kind: "last", duration: { amount: 600, unit: "weeks" } } } }
    const { user } = await openEditor({ condition: plays, focus: { matches: 0 } })
    await user.click(screen.getByTestId(id("done")))
    expect(await screen.findByTestId(id("error"))).toHaveTextContent("Enter a whole number of plays from 1 to 1000.")
    expect(number()).toHaveAttribute("aria-invalid", "true")

    await user.click(screen.getByTestId(id("operator-at-least")))
    expect(screen.getByTestId(id("error"))).toHaveTextContent("Enter a whole number of weeks from 1 to 521.")
    expect(number()).not.toHaveAttribute("aria-invalid")
    expect(screen.getByTestId(id("window-number"))).toHaveAttribute("aria-invalid", "true")
    await user.clear(screen.getByTestId(id("window-number")))
    await user.type(screen.getByTestId(id("window-number")), "52")
    expect(screen.queryByTestId(id("error"))).toBeNull()
  })

  it.each([
    [{ id: "c4", field: "show.seasonsOnDisk", op: "atLeast", value: { count: 3 } }, "seasons", "preset-5", { count: 5 }],
    [{ id: "c5", field: "season.position", op: "notNewest", value: { count: 1 } }, "newest season", "preset-2", { count: 2 }],
  ] as const)("shows the words after the number of %o", async (condition, words, preset, value) => {
    const { user } = await openEditor({ condition, level: "season", focus: { matches: 12 } })
    expect(screen.getByText(words)).toBeVisible()
    await user.click(screen.getByTestId(id(preset)))
    expect(lastDraft().value).toEqual(value)
  })
})

describe("RelativeDateInput", () => {
  it("reads a broken duration as empty days", async () => {
    await openEditor({ condition: { id: "c1", field: "library.added", op: "moreThan", value: { duration: "soon" } }, focus: { matches: 0 } })
    expect(number()).toHaveValue("")
    expect(screen.getByTestId(id("unit"))).toHaveTextContent("days")
    expect(screen.getByTestId(id("preset-90-days"))).toHaveAttribute("aria-checked", "false")
  })
})

describe("RequesterPicker", () => {
  const OPTIONS: RequesterOption[] = [
    { userId: "u-robin", name: "Robin Vale", status: "former", requests: 47 },
    { userId: "u-sky", name: "Sky Moreno", status: "member", requests: 1 },
  ]
  const BY: DraftCondition = {
    id: "c6",
    field: "request.by",
    op: "only",
    value: { requesters: [{ kind: "former" }, { kind: "member", userId: "u-sky" }, { kind: "member", userId: "u-gone" }] },
  }

  it("shows each choice as a chip, and the special groups and members in the list", async () => {
    const { user } = await openEditor({ condition: BY, requesterOptions: OPTIONS, focusPart: "combobox", focus: { matches: 226 } })
    expect(screen.getByTestId(id("list-chip-former"))).toHaveTextContent("Former members")
    expect(screen.getByTestId(id("list-chip-u-sky"))).toHaveTextContent("Sky Moreno")
    expect(screen.getByTestId(id("list-chip-u-gone"))).toHaveTextContent("Unknown member")
    expect(screen.getByTestId(id("operator-only"))).toHaveAttribute("aria-checked", "true")

    await user.click(screen.getByTestId(id("list")))
    const listbox = await screen.findByRole("listbox")
    expect(within(listbox).getByText("Special")).toBeInTheDocument()
    expect(screen.getByTestId(id("list-option-inactive"))).toHaveTextContent("Members inactive for...")
    expect(screen.getByTestId(id("list-option-u-robin"))).toHaveTextContent("Robin Vale47 requests, former member")
    expect(screen.getByTestId(id("list-option-u-sky"))).toHaveTextContent("Sky Moreno1 request")
    expect(await axe(document.body, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })

  it("asks for the days of 'Members inactive for...' below the list, 90 at first", async () => {
    const { user } = await openEditor({ condition: BY, requesterOptions: OPTIONS, focus: { matches: 226 } })
    await user.click(screen.getByTestId(id("list")))
    await user.click(await screen.findByTestId(id("list-option-inactive")))
    expect(lastDraft().value).toEqual({ requesters: [...(BY.value as { requesters: unknown[] }).requesters, { kind: "inactive", days: 90 }] })
    const days = screen.getByLabelText("Inactive for (days)")
    expect(days).toHaveAttribute("data-testid", id("inactive-days"))
    expect(days).toHaveValue("90")
    expect(screen.getByTestId(id("list-chip-inactive"))).toHaveTextContent("Members inactive for 90 days")

    await user.clear(days)
    await user.tab()
    expect(await screen.findByTestId(id("error"))).toHaveTextContent("Enter a whole number of days from 1 to 3650.")
    expect(days).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByTestId(id("list-chip-inactive"))).toHaveTextContent("Members inactive for...")
    await user.type(days, "30")
    await waitFor(() => expect(lastDraft().value).toEqual(expect.objectContaining({ requesters: expect.arrayContaining([{ kind: "inactive", days: 30 }]) })), {
      timeout: 1500,
    })
  })

  it("asks to pick one when the last chip goes", async () => {
    const one = { ...BY, value: { requesters: [{ kind: "anyMember" }] } }
    const { user } = await openEditor({ condition: one, focus: { matches: 0 } })
    await user.click(screen.getByTestId(id("list-chip-any-member-remove")))
    expect(await screen.findByTestId(id("error"))).toHaveTextContent("Pick at least one member or group.")
    expect(screen.getByTestId(id("list"))).toHaveAttribute("aria-invalid", "true")
    expect(lastDraft().value).toEqual({ requesters: [] })
  })

  it("keeps an inactive ref whose days are not a number, and drops a broken ref", async () => {
    const odd = { ...BY, value: { requesters: [{ kind: "inactive", days: "x" }, { kind: "nobody" }] } }
    await openEditor({ condition: odd, focus: { matches: 0 } })
    expect(screen.getByTestId(id("inactive-days"))).toHaveValue("")
    expect(screen.queryByTestId(id("list-chip-nobody"))).toBeNull()
  })
})

describe("ChoiceValue", () => {
  it.each([
    [{ id: "c1", field: "request.exists", op: "is", value: { exists: false } }, "movie", "choice-true", { exists: true }],
    [{ id: "c1", field: "request.requesters", op: "is", value: { did: "neverPlayed" } }, "movie", "choice-all-finished", { did: "allFinished" }],
    [{ id: "c1", field: "show.status", op: "is", value: { status: "ended" } }, "show", "choice-continuing", { status: "continuing" }],
  ] as const)("is a radio group with no operator: %o", async (condition, level, choice, value) => {
    const { user } = await openEditor({ condition, level, focus: { matches: 58 } })
    expect(screen.queryByRole("radiogroup", { name: "Operator" })).toBeNull()
    expect(screen.getByRole("radiogroup", { name: "Value" })).toBeInTheDocument()
    await user.click(screen.getByTestId(id(choice)))
    expect(lastDraft().value).toEqual(value)
    expect(screen.getByTestId(id(choice))).toHaveAttribute("aria-checked", "true")
  })

  it("checks nothing for a value it does not know", async () => {
    await openEditor({ condition: { id: "c1", field: "show.status", op: "is", value: null }, level: "show", focus: FOCUS })
    expect(screen.getByTestId(id("choice-ended"))).toHaveAttribute("aria-checked", "false")
  })
})
