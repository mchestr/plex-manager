import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { domAnimation, LazyMotion } from "motion/react"

import { GuessPage } from "@/components/rewind/pages/guess"
import { PlayerProvider } from "@/components/rewind/stage/player-context"
import { QuizProvider, resetQuizAnswers } from "@/components/rewind/stage/quiz-context"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { GuessData } from "@/lib/rewind/pages/guess.schema"
import { registry } from "@/lib/rewind/registry"

jest.mock("server-only", () => ({}))

let issue: FixtureIssue

beforeAll(async () => {
  issue = await fixtureIssue("night-owl")
})

beforeEach(() => {
  resetQuizAnswers()
  window.sessionStorage.clear()
})

const dataOf = () => issue.pages.find((p) => p.type === "guess")!.data as GuessData

function renderGuess(data: GuessData = dataOf()) {
  const send = jest.fn()
  render(
    <PlayerProvider value={send}>
      <QuizProvider year={2026}>
        <LazyMotion features={domAnimation} strict>
          <GuessPage data={data} issue={issueContext(issue)} />
        </LazyMotion>
      </QuizProvider>
    </PlayerProvider>
  )
  return send
}

/** The option tile at display position n (1-based) holding rank `rank`. */
const tileOf = (rank: number) => {
  const n = dataOf().options.findIndex((o) => o.rank === rank) + 1
  return screen.getByTestId(`rewind-quiz-option-${n}`)
}

describe("04 Guess", () => {
  it("is a radiogroup named by the question, with four poster options and Skip", () => {
    renderGuess()
    const group = screen.getByRole("radiogroup", { name: "Which series did you watch most this year?" })
    expect(within(group).getAllByRole("radio")).toHaveLength(4)
    expect(screen.getByTestId("rewind-quiz-skip")).toBeInTheDocument()
    expect(screen.getByTestId("rewind-quiz-reveal")).toHaveTextContent("")
  })

  it("moves aria-checked with the arrows without answering", async () => {
    const user = userEvent.setup()
    const send = renderGuess()
    const radios = screen.getAllByRole("radio")
    radios[0].focus()
    await user.keyboard("{ArrowRight}")
    expect(radios[1]).toHaveAttribute("aria-checked", "true")
    await user.keyboard("{ArrowRight}")
    expect(radios[2]).toHaveAttribute("aria-checked", "true")
    expect(radios[1]).toHaveAttribute("aria-checked", "false")
    expect(screen.getByTestId("rewind-quiz-reveal")).toHaveTextContent("")
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    [1, "You called it."],
    [2, "Close. It came second."],
    [4, "Not quite: that was your number four."],
  ])("reveals rank %i with its line and releases the player", async (rank, line) => {
    const user = userEvent.setup()
    const send = renderGuess()
    await user.click(tileOf(rank))
    expect(screen.getByTestId("rewind-quiz-reveal")).toHaveTextContent(line)
    expect(send).toHaveBeenCalledWith({ type: "INTERACT_END" })
    expect(screen.queryByTestId("rewind-quiz-skip")).not.toBeInTheDocument()
    expect(JSON.parse(window.sessionStorage.getItem("rewind:quiz:2026")!)).toMatchObject({ rank, kind: "series" })
  })

  it("keeps the unchosen titles at full ink and marks them", async () => {
    const user = userEvent.setup()
    renderGuess()
    await user.click(tileOf(3))
    expect(screen.getAllByText("Not your answer")).toHaveLength(3)
    expect(within(tileOf(3)).getByTestId("rewind-quiz-mark")).toHaveTextContent("Your answer")
    for (const option of dataOf().options) {
      const tile = tileOf(option.rank)
      // only the art fades; the title sits outside the faded layer
      const titles = within(tile).getAllByText((_, el) => el?.classList.contains("block") === true && el.textContent === option.title)
      for (const title of titles) expect(title.closest(".opacity-45")).toBeNull()
    }
    expect(screen.getByTestId("rewind-quiz-answer")).toHaveTextContent("No. 1")
  })

  it("holds autoplay until answered: Skip stores the skip and turns the page", async () => {
    const user = userEvent.setup()
    const send = renderGuess()
    expect(registry.guess.dwell).toBe("hold")
    await user.click(screen.getByTestId("rewind-quiz-skip"))
    expect(send).toHaveBeenCalledWith({ type: "NEXT", source: "button" })
    expect(JSON.parse(window.sessionStorage.getItem("rewind:quiz:2026")!)).toEqual({ skipped: true })
  })

  it("tolerates storage that throws", async () => {
    const user = userEvent.setup()
    const get = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    const set = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    renderGuess()
    await user.click(tileOf(2))
    expect(screen.getByTestId("rewind-quiz-reveal")).toHaveTextContent("Close. It came second.")
    get.mockRestore()
    set.mockRestore()
  })

  it("restores an answer from this tab's session and releases the player at once", () => {
    const pick = dataOf().options.find((o) => o.rank === 2)!
    window.sessionStorage.setItem("rewind:quiz:2026", JSON.stringify({ key: pick.key, rank: 2, title: pick.title, kind: "series" }))
    const send = renderGuess()
    expect(screen.getByTestId("rewind-quiz-reveal")).toHaveTextContent("Close. It came second.")
    expect(send).toHaveBeenCalledWith({ type: "INTERACT_END" })
  })

  it("asks about titles for a mixed quiz, and summarises without the answer", async () => {
    const mixed = await fixtureIssue("weekend-binger")
    const data = mixed.pages.find((p) => p.type === "guess")!.data as GuessData
    expect(data.kind).toBe("mixed")
    render(
      <QuizProvider year={2026}>
        <LazyMotion features={domAnimation} strict>
          <GuessPage data={data} issue={issueContext(mixed)} />
        </LazyMotion>
      </QuizProvider>
    )
    expect(screen.getByRole("radiogroup", { name: "Which title did you watch most this year?" })).toBeInTheDocument()
    expect(registry.guess.srSummary(data, mixed.facts)).toMatchSnapshot()
  })
})
