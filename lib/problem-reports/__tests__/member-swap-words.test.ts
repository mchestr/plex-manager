/**
 * Whether a member's report is one a swap fixes, from what they said and how
 * the title played, and the words for the swap, the allowance and each
 * refusal, as the sheet and Discord show them.
 */

import { allowanceWords, refusalWords, swapFits } from "@/lib/problem-reports/member-swap-words"

const PLAYED = { device: "others_play" as const, playedToEnd: false, transcoded: false }

describe("swapFits", () => {
  it("swaps a playback problem only once other titles play on the member's player", () => {
    expect(swapFits("wont_start", PLAYED)).toBe("SWAP")
    expect(swapFits("wont_start", { ...PLAYED, device: "nothing_plays" })).toBe("TIPS")
    expect(swapFits("stops", { ...PLAYED, device: "not_tried" })).toBe("TIPS")
    expect(swapFits("no_sound", { ...PLAYED, device: undefined })).toBe("TIPS")
  })

  it("leaves a copy that has played to the end to the server admin, since it may be the device or the connection", () => {
    expect(swapFits("out_of_sync", { ...PLAYED, playedToEnd: true })).toBe("PLAYED_TO_END")
    expect(swapFits("out_of_sync", { ...PLAYED, playedToEnd: null })).toBe("SWAP")
  })

  it("shows the tips first for glitches on a converted play", () => {
    expect(swapFits("glitches", { ...PLAYED, transcoded: true })).toBe("TIPS")
  })

  it("swaps a problem that's in the copy itself without asking about the player", () => {
    expect(swapFits("filmed_off_screen", { playedToEnd: true, transcoded: true })).toBe("SWAP")
    expect(swapFits("stuck_subtitles", { playedToEnd: null, transcoded: false })).toBe("SWAP")
  })

  it("fits no problem that a swap doesn't fix", () => {
    expect(swapFits("blurry", PLAYED)).toBe("NOT_A_SWAP")
    expect(swapFits("buffers", PLAYED)).toBe("NOT_A_SWAP")
  })
})

describe("allowanceWords", () => {
  it("says how many swaps are left and when one comes back", () => {
    expect(allowanceWords({ left: 3, of: 3, nextBack: null })).toBe("3 of 3 swaps left.")
    expect(allowanceWords({ left: 2, of: 3, nextBack: "Nov 10" })).toBe("2 of 3 swaps left. One comes back Nov 10.")
  })

  it("names the last one", () => {
    expect(allowanceWords({ left: 1, of: 3, nextBack: "Nov 12" })).toBe("This is your last swap until Nov 12.")
    expect(allowanceWords({ left: 1, of: 1, nextBack: null })).toBe("1 of 1 swap left.")
  })
})

describe("refusalWords", () => {
  it.each([
    ["OUT_OF_SWAPS", "Nov 10", "You're out of swaps until Nov 10."],
    ["TITLE_RECENT", null, "This title was swapped recently."],
    ["NOT_PLAYED", null, "We can only swap titles you've played recently."],
    ["NEEDS_APPROVAL", null, "The server admin checks swaps for your account first."],
    ["PAUSED", null, "Automatic swaps are paused right now."],
    ["OFF", null, null],
  ] as const)("words %s", (reason, until, words) => {
    expect(refusalWords(reason, until)).toBe(words)
  })
})
