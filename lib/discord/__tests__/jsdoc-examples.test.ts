import { fitDiscordContent } from "../chat-safety"

describe("JSDoc Documentation Examples", () => {
  it("fitDiscordContent", () => {
    expect(fitDiscordContent("short answer")).toEqual(["short answer"])
    expect(fitDiscordContent("word ".repeat(600)).length).toBe(2)
  })
})
