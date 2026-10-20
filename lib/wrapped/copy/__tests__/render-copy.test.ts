import type { TokenSource } from "../render-copy"
import { renderCopy, renderCopyText, tokenIds } from "../render-copy"

const title = (display: string): TokenSource[string] => ({ display, unit: "title" })

describe("renderCopy", () => {
  it.each(["Ke$ha: My Crazy Beautiful Life", "Before $& After", "Left $' Right", "Tick $` Tock", "$1 and $$", "{{fact:member.firstName}}"])(
    "inserts %p literally",
    (name) => {
      const facts: TokenSource = { "series[1].title": title(name), "member.firstName": { display: "Mike", unit: "name" } }
      expect(renderCopyText("You watched {{fact:series[1].title}} most.", facts)).toBe(`You watched ${name} most.`)
      expect(renderCopy("{{fact:series[1].title}}", facts)).toEqual([{ kind: "title", id: "series[1].title", text: name }])
    }
  )

  it("splits text, number tokens and title tokens", () => {
    const facts: TokenSource = {
      "time.perDay": { display: "3\u00A0h 54\u00A0m", unit: "duration" },
      "series[1].title": title("Severance"),
    }
    expect(renderCopy("About {{fact:time.perDay}} a day, mostly {{fact:series[1].title}}.", facts)).toEqual([
      { kind: "text", text: "About " },
      { kind: "token", id: "time.perDay", text: "3\u00A0h 54\u00A0m" },
      { kind: "text", text: " a day, mostly " },
      { kind: "title", id: "series[1].title", text: "Severance" },
      { kind: "text", text: "." },
    ])
  })

  it("renders a missing fact as an empty token and leaves non-tokens alone", () => {
    expect(renderCopyText("A {{fact:time.perDay}} b {{fact:not a token}}", {})).toBe("A  b {{fact:not a token}}")
    expect(renderCopy("{{fact:time.perDay}}", {})).toEqual([{ kind: "token", id: "time.perDay", text: "" }])
  })

  it("reads dotted and indexed ids", () => {
    expect(tokenIds("{{fact:taste.genreByMonth[3]}} {{fact:time.milestones[2].date}} {{fact:tz.label}}")).toEqual([
      "taste.genreByMonth[3]",
      "time.milestones[2].date",
      "tz.label",
    ])
  })
})
