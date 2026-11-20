import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { levelHelp, librariesForLevel, READ_ONLY_LEVEL, ScopeFieldset } from "@/components/admin/cleanup/editor/scope-fieldset"
import type { EditorLibrary } from "@/lib/cleanup/types/rule-parts"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

expect.extend(toHaveNoViolations)

// Invented libraries.
const LIBRARIES: EditorLibrary[] = [
  { sectionId: "1", title: "Films", level: "movie", arr: "radarr", disabledReason: null },
  { sectionId: "2", title: "Films 4K", level: "movie", arr: null, disabledReason: "Radarr has no root folder for this library." },
  { sectionId: "4", title: "Home videos", level: "movie", arr: "radarr", disabledReason: "Its titles have no ids that Radarr can match." },
  { sectionId: "5", title: "Kids films", level: "movie", arr: "radarr", disabledReason: null },
  { sectionId: "3", title: "Series", level: "show", arr: "sonarr", disabledReason: null },
]

const spies = { onLevel: jest.fn(), onLibraries: jest.fn() }
let openLibraries: () => void = () => {}

function Harness({ isLive = false, notApplicable = [], error = null }: { isLive?: boolean; notApplicable?: string[]; error?: string | null }) {
  const [level, setLevel] = useState<Level>("movie")
  const [libraries, setLibraries] = useState(["1"])
  const [request, setRequest] = useState<object | null>(null)
  openLibraries = () => setRequest({})
  return (
    <ScopeFieldset
      level={level}
      libraries={libraries}
      options={LIBRARIES}
      isLive={isLive}
      notApplicable={notApplicable}
      error={error}
      openLibraries={request}
      onLevel={(next, ids) => {
        spies.onLevel(next, ids)
        setLevel(next)
        setLibraries(ids)
      }}
      onLibraries={(ids) => {
        spies.onLibraries(ids)
        setLibraries(ids)
      }}
    />
  )
}

const tid = (id: string) => screen.getByTestId(id)

beforeEach(() => Object.values(spies).forEach((spy) => spy.mockClear()))

describe("ScopeFieldset", () => {
  it("reads Clean up [Movies] in the [Films] library, with the help line naming the libraries out of scope", async () => {
    const { container } = render(<Harness />)
    const part = screen.getByRole("group", { name: "Clean up" })
    expect(tid("admin-cleanup-scope-level")).toHaveAccessibleName("Movies, level. Change.")
    expect(tid("admin-cleanup-scope-libraries")).toHaveAccessibleName("Films, library. Change.")
    expect(part).toHaveTextContent("library.")
    expect(part).toHaveTextContent(
      "Movies: each movie is checked on its own. Films 4K and Home videos are never in scope, because Radarr does not manage them."
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it("changes the level from a radio list, and takes the libraries of the new type", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(tid("admin-cleanup-scope-level"))
    expect(await screen.findByTestId("admin-cleanup-scope-level-movie")).toHaveAttribute("aria-checked", "true")
    await user.click(tid("admin-cleanup-scope-level-season"))
    expect(spies.onLevel).toHaveBeenCalledWith("season", ["3"])
    expect(tid("admin-cleanup-scope-level")).toHaveTextContent("Seasons")
    expect(tid("admin-cleanup-scope-libraries")).toHaveTextContent("Series")
    expect(screen.getByRole("group", { name: "Clean up" })).toHaveTextContent(
      "Seasons: each season is checked on its own. The newest season of a continuing show is never in scope. Specials (season 0) are never in scope."
    )
    await user.click(tid("admin-cleanup-scope-level"))
    await user.click(await screen.findByTestId("admin-cleanup-scope-level-season"))
    expect(spies.onLevel).toHaveBeenCalledTimes(1)
  })

  it("lists the libraries of the level, with the ones out of scope disabled and their reasons", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(tid("admin-cleanup-scope-libraries"))
    const out = await screen.findByTestId("admin-cleanup-scope-library-2")
    expect(out).toHaveAttribute("data-disabled")
    expect(out).toHaveAccessibleDescription("Radarr has no root folder for this library.")
    expect(screen.queryByTestId("admin-cleanup-scope-library-3")).toBeNull()
    await user.click(tid("admin-cleanup-scope-library-5"))
    expect(spies.onLibraries).toHaveBeenLastCalledWith(["1", "5"])
    expect(tid("admin-cleanup-scope-libraries")).toHaveTextContent("Films and Kids films")
    expect(tid("admin-cleanup-scope-libraries")).toHaveAccessibleName("Films and Kids films, libraries. Change.")
    expect(screen.getByRole("group", { name: "Clean up" })).toHaveTextContent("libraries.")
    await user.click(tid("admin-cleanup-scope-library-1"))
    await user.click(tid("admin-cleanup-scope-library-5"))
    expect(spies.onLibraries).toHaveBeenLastCalledWith([])
    expect(tid("admin-cleanup-scope-libraries")).toHaveTextContent("Choose a library")
    expect(tid("admin-cleanup-scope-libraries")).toHaveAttribute("data-state", "open")
  })

  it("shows the level read only on a live rule, with its reason", () => {
    render(<Harness isLive />)
    const level = tid("admin-cleanup-scope-level")
    expect(level.tagName).toBe("SPAN")
    expect(level).toHaveAttribute("data-state", "readOnly")
    expect(level).toHaveAccessibleDescription(READ_ONLY_LEVEL)
  })

  it("lists the conditions that do not apply after a level change", () => {
    const { unmount } = render(<Harness notApplicable={["Show status: ended"]} />)
    expect(screen.getByRole("status")).toHaveTextContent(
      "You changed the level to Movies1 condition does not apply to movies: Show status: ended. It stays, marked, until you remove it or change the level back. Save is blocked until then."
    )
    unmount()
    render(<Harness notApplicable={["Show status: ended", "Seasons on disk at least 3"]} />)
    expect(screen.getByRole("status")).toHaveTextContent("2 conditions do not apply to movies: Show status: ended; Seasons on disk at least 3. They stay, marked")
  })

  it("shows a library error on the token, and opens the list on request", async () => {
    render(<Harness error="Choose at least one library." />)
    expect(tid("admin-cleanup-scope-libraries")).toHaveAttribute("data-state", "error")
    expect(tid("admin-cleanup-scope-libraries")).toHaveAccessibleDescription("Choose at least one library.")
    act(() => openLibraries())
    expect(await screen.findByTestId("admin-cleanup-scope-library-1")).toBeInTheDocument()
  })
})

describe("scope helpers", () => {
  it("words the help line with one library out of scope, and none", () => {
    expect(levelHelp("show", [...LIBRARIES, { sectionId: "6", title: "Anime", level: "show", arr: null, disabledReason: "No root folder." }])).toBe(
      'Whole shows: a show is checked with all its seasons and episodes. "Last played" means any episode. Anime is never in scope, because Sonarr does not manage it.'
    )
    expect(levelHelp("show", LIBRARIES)).toBe('Whole shows: a show is checked with all its seasons and episodes. "Last played" means any episode.')
  })

  it("keeps the libraries within one type, and takes every offered library of a new type", () => {
    expect(librariesForLevel("season", "show", ["3"], LIBRARIES)).toEqual(["3"])
    expect(librariesForLevel("movie", "show", ["3"], LIBRARIES)).toEqual(["1", "5"])
  })
})
