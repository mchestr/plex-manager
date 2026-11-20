import { act, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { ThenFieldset } from "@/components/admin/cleanup/editor/then-fieldset"
import type { RuleThen } from "@/lib/validations/cleanup-rule"
import type { Level, Mode } from "@/lib/validations/cleanup-vocabulary"

expect.extend(toHaveNoViolations)

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

const THEN: RuleThen = { graceDays: 30, action: "movie.delete", importListExclusion: true }
const onThen = jest.fn()
let open: (name: "grace" | "action") => void = () => {}

function Harness({ start = THEN, level = "movie", mode = "dryRun", error = null, importListCount }: { start?: Partial<RuleThen>; level?: Level; mode?: Mode
  error?: string | null; importListCount?: number | null }) {
  const [then, setThen] = useState(start)
  const [request, setRequest] = useState<{ name: "grace" | "action" } | null>(null)
  open = (name) => setRequest({ name })
  return (
    <ThenFieldset
      then={then}
      level={level}
      mode={mode}
      minGrace={7}
      zone="UTC"
      error={error}
      importListCount={importListCount}
      openRequest={request}
      onThen={(patch) => {
        onThen(patch)
        setThen((t) => ({ ...t, ...patch }))
      }}
    />
  )
}

const tid = (id: string) => screen.getByTestId(id)

beforeEach(() => {
  onThen.mockClear()
  jest.useFakeTimers({ now: Date.parse("2026-11-08T12:00:00Z"), doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame"] })
})
afterEach(() => jest.useRealTimers())

describe("ThenFieldset", () => {
  it("reads as one sentence with the grace and action tokens, the exclusion and three info lines", async () => {
    const { container } = render(<Harness />)
    const part = screen.getByRole("group", { name: "Then" })
    expect(part.textContent).toMatch(/^ThenPut matches in Leaving soon for30 days,thendelete the movie and its files in Radarr\./)
    expect(tid("admin-cleanup-then-grace")).toHaveAccessibleName("30 days, grace period. Change.")
    expect(tid("admin-cleanup-then-action")).toHaveAccessibleName("delete the movie and its files in Radarr, action. Change.")
    expect(tid("admin-cleanup-then-action").parentElement?.className).toContain("whitespace-nowrap")
    expect(screen.getByRole("checkbox", { name: "Add an import list exclusion" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription("Import lists do not download the movie again.")
    const lines = within(part).getAllByRole("listitem")
    expect(lines.map((line) => line.textContent)).toEqual([
      "Members see Leaving soon on Plex Home and in the app once this rule leaves Dry run. Change where in Settings",
      "Turned on today, the first leave date is Dec 8, 2026.",
      "Mode: Dry run. Runs record matches and change nothing. To change the mode, use Turn on.",
    ])
    expect(tid("admin-cleanup-then-plex-link")).toHaveAttribute("href", "/admin/cleanup?tab=settings&section=cleanup-plex")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("names how many titles came from an import list in the exclusion hint (UX 5.5)", () => {
    const { unmount } = render(<Harness importListCount={169} />)
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription("Import lists do not download the movie again. 169 movies here came from an import list.")
    unmount()
    render(<Harness importListCount={1} start={{ ...THEN, action: "show.delete" }} level="show" />)
    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription("Import lists do not download the show again. 1 show here came from an import list.")
  })

  it("changes the grace period with a chip, and with Other", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<Harness />)
    await user.click(tid("admin-cleanup-then-grace"))
    expect(await screen.findByTestId("admin-cleanup-then-grace-chips-option-30")).toHaveAttribute("aria-checked", "true")
    await user.click(tid("admin-cleanup-then-grace-chips-option-90"))
    expect(onThen).toHaveBeenLastCalledWith({ graceDays: 90 })
    expect(tid("admin-cleanup-then-grace")).toHaveTextContent("90 days")
    await user.click(tid("admin-cleanup-then-grace-chips-other"))
    const input = await screen.findByTestId("admin-cleanup-then-grace-other-input")
    await user.clear(input)
    await user.type(input, "45")
    expect(onThen).toHaveBeenLastCalledWith({ graceDays: 45 })
    await user.clear(input)
    await user.type(input, "0")
    expect(onThen).not.toHaveBeenCalledWith({ graceDays: 0 })
  })

  it("warns below 14 days, and in Automatic refuses less than the floor", () => {
    const { unmount } = render(<Harness start={{ ...THEN, graceDays: 10 }} />)
    expect(screen.getByRole("status")).toHaveTextContent("Members get less than 2 weeks")
    expect(screen.getByRole("status")).toHaveTextContent("A grace period of 10 days is short. Automatic needs at least 7 days.")
    unmount()
    render(<Harness start={{ ...THEN, graceDays: 5 }} mode="automatic" />)
    expect(screen.getByText("In Automatic, the grace period is at least 7 days.")).toBeInTheDocument()
    expect(tid("admin-cleanup-then-grace")).toHaveAttribute("data-state", "error")
    expect(tid("admin-cleanup-then-grace")).toHaveAccessibleDescription("In Automatic, the grace period is at least 7 days.")
  })

  it("changes the action, and shows the exclusion for delete actions only", async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
    render(<Harness />)
    await user.click(screen.getByRole("checkbox"))
    expect(onThen).toHaveBeenLastCalledWith({ importListExclusion: false })
    await user.click(tid("admin-cleanup-then-action"))
    await user.click(await screen.findByTestId("admin-cleanup-then-action-movie-unmonitor-delete-files"))
    expect(onThen).toHaveBeenLastCalledWith({ action: "movie.unmonitorDeleteFiles" })
    expect(tid("admin-cleanup-then-action")).toHaveTextContent("unmonitor the movie and delete its files in Radarr")
    expect(screen.queryByRole("checkbox")).toBeNull()
  })

  it("shows the one season action read only", () => {
    render(<Harness start={{ graceDays: 30, action: "season.unmonitorDeleteFiles", importListExclusion: false }} level="season" />)
    expect(tid("admin-cleanup-then-action")).toHaveAttribute("data-state", "readOnly")
    expect(tid("admin-cleanup-then-action")).toHaveTextContent("unmonitor the season and delete its files in Sonarr")
  })

  it("words the info lines of a live rule, and incomplete tokens", () => {
    const { unmount } = render(<Harness mode="reviewFirst" />)
    const lines = screen.getAllByRole("listitem").map((line) => line.textContent)
    expect(lines[0]).toBe("Members see Leaving soon on Plex Home and in the app. Change where in Settings")
    expect(lines[1]).toBe("A title that joins Leaving soon today leaves on Dec 8, 2026.")
    expect(lines[2]).toBe("Mode: Review first. At the leave date, items wait for your approval. To change the mode, use Change mode.")
    unmount()
    render(<Harness mode="automatic" start={{}} error="Choose an action." />)
    expect(screen.getAllByRole("listitem").map((line) => line.textContent)).toHaveLength(2)
    expect(tid("admin-cleanup-then-grace")).toHaveTextContent("Choose a grace period")
    expect(tid("admin-cleanup-then-action")).toHaveTextContent("Choose an action")
    expect(screen.getByText("Choose an action.")).toBeInTheDocument()
    expect(screen.getByText(/^Mode:/).parentElement).toHaveTextContent("At the leave date, items are deleted inside the daily budget.")
  })

  it("opens the grace or action list on request", async () => {
    render(<Harness />)
    act(() => open("action"))
    expect(await screen.findByTestId("admin-cleanup-then-action-movie-delete")).toBeInTheDocument()
    act(() => open("grace"))
    expect(await screen.findByTestId("admin-cleanup-then-grace-chips")).toBeInTheDocument()
  })
})
