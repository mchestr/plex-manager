/**
 * What sending a report will do, before the member sends it: Look for them,
 * Look for a better copy, or the server admin, from the problem, the type of
 * title, a converted play and the services that are set up.
 */

import { consequence, sendAction, type SendContext } from "@/lib/problem-reports/consequence"

const ALL: SendContext = { type: "movie", transcoded: false, radarr: true, sonarr: true }

describe("sendAction", () => {
  it("looks for missing episodes of a show or an episode when Sonarr is set up", () => {
    expect(sendAction("missing_episodes", { ...ALL, type: "show" })).toBe("LOOK_FOR_MISSING")
    expect(sendAction("missing_episodes", { ...ALL, type: "episode" })).toBe("LOOK_FOR_MISSING")
    expect(sendAction("missing_episodes", { ...ALL, type: "show", sonarr: false })).toBe("TO_ADMIN")
  })

  it("looks for a better copy of a movie with Radarr, or an episode with Sonarr", () => {
    expect(sendAction("blurry", ALL)).toBe("BETTER_COPY")
    expect(sendAction("blurry", { ...ALL, type: "episode" })).toBe("BETTER_COPY")
    expect(sendAction("blurry", { ...ALL, radarr: false })).toBe("TO_ADMIN")
    expect(sendAction("blurry", { ...ALL, type: "episode", sonarr: false })).toBe("TO_ADMIN")
  })

  it("sends a whole show's blurry picture, a converted play, and every other problem to the server admin", () => {
    expect(sendAction("blurry", { ...ALL, type: "show" })).toBe("TO_ADMIN")
    expect(sendAction("blurry", { ...ALL, transcoded: true })).toBe("TO_ADMIN")
    expect(sendAction("wont_start", ALL)).toBe("TO_ADMIN")
  })
})

describe("consequence", () => {
  it("names the button for what happens", () => {
    expect(consequence("blurry", ALL)).toEqual({ action: "BETTER_COPY", line: "We'll look for a better copy. If there isn't one, nothing changes.", button: "Look for a better copy" })
    expect(consequence("missing_episodes", { ...ALL, type: "show" })).toMatchObject({ button: "Look for them" })
    expect(consequence("stops", ALL)).toEqual({ action: "TO_ADMIN", line: "The server admin will take a look. We'll message you when it's done.", button: "Send to the server admin" })
  })

  it("asks whether a converted picture is still blurry at Maximum before it goes to the server admin", () => {
    expect(consequence("blurry", { ...ALL, transcoded: true })).toEqual({
      action: "TO_ADMIN",
      line: "Still blurry with the quality set to Maximum? Send it to the server admin.",
      button: "Send to the server admin",
    })
  })
})
