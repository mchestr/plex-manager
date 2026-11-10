import { fitDiscordContent } from "../chat-safety"
import { plainDiscordText } from "../plain-text"

describe("JSDoc Documentation Examples", () => {
  it("fitDiscordContent", () => {
    expect(fitDiscordContent("short answer")).toEqual(["short answer"])
    expect(fitDiscordContent("word ".repeat(600)).length).toBe(2)
  })

  it("plainDiscordText", () => {
    expect(plainDiscordText("[Heat](https://evil.example)", 100)).toBe("\\[Heat\\]\\(https\\://evil.example\\)")
  })
})
