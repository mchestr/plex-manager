import { screen, waitFor, within } from "@testing-library/react"

import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"

import { calls, id, LAST_PLAYED, number, openEditor, useViewport } from "./editor-harness"

useViewport()

beforeEach(() => {
  for (const fn of Object.values(calls)) fn.mockClear()
})

const SONARR_NOT_SET_UP: SourceStatus[] = [
  { service: "plex", state: "ok", readAt: "2026-11-08T11:07:00Z" },
  { service: "sonarr", state: "notConfigured", readAt: null },
]

const list = () => screen.getByRole("listbox")
const option = (fieldId: string) => screen.getByTestId(id(`field-option-${fieldId}`))

describe("FieldPicker", () => {
  it("opens on a new row with focus in its search, and lists the four groups in order", async () => {
    await openEditor({ focusPart: "fieldSearch" })
    await waitFor(() => expect(screen.getByTestId(id("field-search"))).toHaveFocus())
    expect(screen.getByTestId(id("field-search"))).toHaveAttribute("placeholder", "Find a field")
    const headings = Array.from(list().querySelectorAll("[cmdk-group-heading]")).map((node) => node.textContent)
    expect(headings).toEqual(["Watching", "Requests", "Library", "Shows and seasons"])
    expect(option("watch-last-played")).toHaveAttribute("aria-selected", "true")
    expect(option("watch-plays")).toHaveTextContent("Counted plays by anyone, from Tautulli, in total or in the last N days.")
    // The help line under the trigger gives way to the list, which holds the same words.
    const help = screen.getAllByText("The newest counted play by anyone, from Tautulli. A play counts after 2 minutes or 90 %.")
    expect(help).toHaveLength(1)
    expect(list()).toContainElement(help[0])
  })

  it("shows fields of other levels disabled, with the reason", async () => {
    await openEditor({ focusPart: "fieldSearch" })
    expect(option("show-status")).toHaveAttribute("aria-disabled", "true")
    expect(option("show-status")).toHaveTextContent("Only for whole shows and seasons")
    expect(option("season-position")).toHaveTextContent("Only for seasons")
  })

  it("shows the fields of a service that is not set up disabled: 'Set up Sonarr to use this'", async () => {
    await openEditor({ focusPart: "fieldSearch", level: "show", sources: SONARR_NOT_SET_UP })
    expect(option("show-status")).toHaveAttribute("aria-disabled", "true")
    expect(option("show-status")).toHaveTextContent("Set up Sonarr to use this")
    expect(option("show-last-episode-added")).not.toHaveAttribute("aria-disabled", "true")
    expect(option("watch-last-played")).toHaveTextContent("Last played (any episode)")
  })

  it("filters by name as you type, and says when nothing matches", async () => {
    const { user } = await openEditor({ focusPart: "fieldSearch" })
    await user.type(screen.getByTestId(id("field-search")), "siz")
    expect(within(list()).getAllByRole("option")).toHaveLength(1)
    expect(option("file-size")).toHaveTextContent("Size on disk")
    expect(within(list()).queryByText("Watching")).toBeNull()

    await user.clear(screen.getByTestId(id("field-search")))
    await user.type(screen.getByTestId(id("field-search")), "zzz")
    expect(screen.getByText("No field has that name.")).toBeInTheDocument()
  })

  it("lists matching recipe names under Other matches, and a choice opens the recipe", async () => {
    const onOpenRecipe = jest.fn()
    const { user } = await openEditor({ focusPart: "fieldSearch", onOpenRecipe })
    await user.type(screen.getByTestId(id("field-search")), "nobody")
    expect(within(list()).getByText("Other matches")).toBeInTheDocument()
    expect(screen.getByTestId(id("recipe-movies-nobody-watches"))).toHaveTextContent("Movies nobody watches")
    await user.click(screen.getByTestId(id("recipe-old-seasons")))
    expect(onOpenRecipe).toHaveBeenCalledWith("old-seasons")
    // The editor stays as it is.
    expect(screen.getByTestId("admin-cleanup-condition-editor")).toBeInTheDocument()
    expect(calls.onDraftChange).not.toHaveBeenCalled()
  })

  it("shows no recipes without a handler or a search", async () => {
    const { user } = await openEditor({ focusPart: "fieldSearch" })
    await user.type(screen.getByTestId(id("field-search")), "nobody")
    expect(screen.queryByText("Other matches")).toBeNull()
  })

  it("chooses with the arrows and Enter: the row takes the field's default, and focus moves to the value", async () => {
    const { user, editor } = await openEditor({ focusPart: "fieldSearch" })
    await user.type(screen.getByTestId(id("field-search")), "added")
    await user.keyboard("{Enter}")
    expect(calls.onDraftChange).toHaveBeenLastCalledWith({ id: "c2", field: "library.added", op: "moreThan", value: { duration: { amount: 90, unit: "days" } } })
    expect(editor).toHaveAccessibleName("Condition 2 of 3 Added")
    expect(screen.queryByRole("listbox")).toBeNull()
    await waitFor(() => expect(number()).toHaveFocus())
    expect(number()).toHaveValue("90")
    expect(screen.queryByTestId(id("never"))).toBeNull()
    // The histogram of Last played waits for the preview of the new field.
    expect(screen.queryByTestId(id("histogram"))).toBeNull()
  })

  it("moves focus to the checked radio after choosing a field with a choice value", async () => {
    const { user } = await openEditor({ focusPart: "fieldSearch" })
    await user.type(screen.getByTestId(id("field-search")), "overseerr")
    await user.keyboard("{Enter}")
    await waitFor(() => expect(screen.getByTestId(id("choice-false"))).toHaveFocus())
  })

  it("opens and closes from the trigger, and the same field keeps the value", async () => {
    const { user } = await openEditor({ focusPart: "field" })
    const trigger = screen.getByTestId(id("field"))
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(trigger).toHaveAttribute("aria-expanded", "false")
    await user.click(trigger)
    expect(trigger).toHaveAttribute("aria-expanded", "true")
    await user.click(trigger)
    expect(screen.queryByRole("listbox")).toBeNull()

    await user.click(trigger)
    await user.click(option("watch-last-played"))
    expect(calls.onDraftChange).not.toHaveBeenCalled()
    expect(number()).toHaveValue("365")
    await user.click(screen.getByTestId(id("done")))
    expect(calls.onDone).toHaveBeenCalledWith(LAST_PLAYED)
  })
})
