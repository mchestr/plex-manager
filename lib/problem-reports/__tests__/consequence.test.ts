/**
 * What sending a report will do, before the member sends it: Look for them,
 * Look for a better copy, Fix the details, Swap the copy, or the server
 * admin, from the problem, the type of title, a converted play, the services
 * that are set up, and members' swaps as the gate decides them.
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

  it("refreshes wrong details of a movie with Radarr, or a show or an episode with Sonarr", () => {
    expect(sendAction("wrong_details", ALL)).toBe("REFRESH")
    expect(sendAction("wrong_details", { ...ALL, type: "show" })).toBe("REFRESH")
    expect(sendAction("wrong_details", { ...ALL, type: "episode", radarr: false })).toBe("REFRESH")
    expect(sendAction("wrong_details", { ...ALL, radarr: false })).toBe("TO_ADMIN")
    expect(sendAction("wrong_details", { ...ALL, type: "show", sonarr: false })).toBe("TO_ADMIN")
    expect(sendAction("different_title", ALL)).toBe("TO_ADMIN")
  })

  it("sends a whole show's blurry picture, a converted play, and every other problem to the server admin", () => {
    expect(sendAction("blurry", { ...ALL, type: "show" })).toBe("TO_ADMIN")
    expect(sendAction("blurry", { ...ALL, transcoded: true })).toBe("TO_ADMIN")
    expect(sendAction("wont_start", ALL)).toBe("TO_ADMIN")
  })
})

describe("consequence", () => {
  it("names the button for what happens", () => {
    expect(consequence("blurry", ALL)).toEqual({ action: "BETTER_COPY", line: "We'll look for a better copy. If there isn't one, nothing changes.", button: "Look for a better copy", note: null })
    expect(consequence("missing_episodes", { ...ALL, type: "show" })).toMatchObject({ button: "Look for them" })
    expect(consequence("wrong_details", ALL)).toEqual({ action: "REFRESH", line: "We'll check the details and ask Plex to read them again. The file stays the same.", button: "Fix the details", note: null })
    expect(consequence("stops", ALL)).toEqual({ action: "TO_ADMIN", line: "The server admin will take a look. We'll message you when it's done.", button: "Send to the server admin", note: null })
  })

  it("asks whether a converted picture is still blurry at Maximum before it goes to the server admin", () => {
    expect(consequence("blurry", { ...ALL, transcoded: true })).toEqual({
      action: "TO_ADMIN",
      line: "Still blurry with the quality set to Maximum? Send it to the server admin.",
      button: "Send to the server admin",
      note: null,
    })
  })
})

describe("a member's swap", () => {
  const OFFER = { ok: true as const, left: 2, of: 3, nextBack: "Nov 10" }
  const ON: SendContext = { ...ALL, device: "others_play", playedToEnd: false, swap: OFFER }

  it("swaps the copy within the member's allowance, and says what it spends", () => {
    expect(consequence("wont_start", ON)).toEqual({
      action: "SWAP",
      line: "We'll find a different copy and swap it in. The one you have keeps playing until the new one is ready, which can take a few minutes to a day. Uses 1 of your 3 swaps.",
      button: "Swap the copy",
      note: "2 of 3 swaps left. One comes back Nov 10.",
    })
    expect(consequence("stuck_subtitles", { ...ON, type: "episode", device: undefined })).toMatchObject({ action: "SWAP" })
  })

  it("sends it to the server admin with why the gate refused it", () => {
    expect(consequence("wont_start", { ...ON, swap: { ok: false, reason: "OUT_OF_SWAPS", until: "Nov 10" } })).toEqual({
      action: "TO_ADMIN",
      line: "The server admin will take a look. We'll message you when it's done.",
      button: "Send to the server admin",
      note: "You're out of swaps until Nov 10.",
    })
    expect(consequence("wont_start", { ...ON, playedToEnd: true })).toMatchObject({ action: "TO_ADMIN", note: "It has played to the end since it was added, so it may be your device or connection." })
  })

  it("leaves it to the server admin without members' swaps, the service, other titles playing, or a single file", () => {
    expect(consequence("wont_start", { ...ON, swap: null })).toMatchObject({ action: "TO_ADMIN", note: null })
    expect(consequence("wont_start", { ...ON, radarr: false })).toMatchObject({ action: "TO_ADMIN", note: null })
    expect(consequence("wont_start", { ...ON, device: "nothing_plays" })).toMatchObject({ action: "TO_ADMIN", note: null })
    expect(consequence("wont_start", { ...ON, type: "show" })).toMatchObject({ action: "TO_ADMIN", note: null })
  })
})

describe("a member's fix of the Plex match", () => {
  it("fixes the match of a movie with Radarr or a show with Sonarr while members' fixes are on", () => {
    expect(consequence("different_title", { ...ALL, matchFixes: true })).toEqual({
      action: "FIX_MATCH",
      line: "We'll fix the title and poster in Plex. The file stays the same.",
      button: "Fix the details",
      note: null,
    })
    expect(sendAction("different_title", { ...ALL, type: "show", matchFixes: true })).toBe("FIX_MATCH")
    expect(sendAction("different_title", { ...ALL, type: "show", sonarr: false, matchFixes: true })).toBe("TO_ADMIN")
  })
})
