/**
 * The server admin's Discord alert text: one report, or a digest of a
 * member's reports with the first five listed, each with its problem and
 * link, the member's name and the titles as plain text, and no link embeds.
 */

import { adminAlertText, memberUpdateText } from "@/lib/problem-reports/notify"

const BASE = "https://plex.example.com"
const report = (id: string, title: string, problem = "wont_start") => ({ id, title, problem })

describe("adminAlertText", () => {
  it("names the member, the title and the problem, with a link to the report", () => {
    expect(adminAlertText("Jane", [report("r1", "Heat (1995)")], BASE)).toBe(
      "Jane reported a problem with Heat \\(1995\\): Won't start.\n<https://plex.example.com/admin/problem-reports/r1>"
    )
  })

  it("lists a member's reports in one message, the first five and how many more", () => {
    const reports = Array.from({ length: 7 }, (_, index) => report(`r${index}`, `Title ${index}`, "blurry"))

    expect(adminAlertText(null, reports, BASE)).toBe(
      [
        "A member reported 7 problems:",
        "- Title 0: Blurry or low quality <https://plex.example.com/admin/problem-reports/r0>",
        "- Title 1: Blurry or low quality <https://plex.example.com/admin/problem-reports/r1>",
        "- Title 2: Blurry or low quality <https://plex.example.com/admin/problem-reports/r2>",
        "- Title 3: Blurry or low quality <https://plex.example.com/admin/problem-reports/r3>",
        "- Title 4: Blurry or low quality <https://plex.example.com/admin/problem-reports/r4>",
        "And 2 more: <https://plex.example.com/admin/problem-reports>",
      ].join("\n")
    )
  })

  it("shows a member's name and a title as plain text", () => {
    const text = adminAlertText("@everyone [click](https://evil.example)", [report("r1", "**Heat**‮")], BASE)

    expect(text).toBe(
      "\\@everyone \\[click\\]\\(https\\://evil.example\\) reported a problem with \\*\\*Heat\\*\\*: Won't start.\n<https://plex.example.com/admin/problem-reports/r1>"
    )
  })

  it("stays under Discord's 2,000 characters for the worst digest", () => {
    const longBase = `https://${"a".repeat(80)}.example.com`
    const reports = Array.from({ length: 6 }, (_, index) => report(`c${"x".repeat(23)}${index}`, "*".repeat(300), "wrong_details"))

    const text = adminAlertText("_".repeat(200), reports, longBase)

    expect(longBase).toHaveLength(100)
    expect(text.length).toBeLessThan(2000)
  })
})

describe("memberUpdateText", () => {
  const update = { own: true, status: "FIXED" as const, by: "fix" as const, action: "LOOK_FOR_MISSING" as const, title: "The Office (2005)", hasNote: false }
  const link = "\nYour reports: <https://plex.example.com/report>"

  it("says a fix found the missing episodes, for the member and their followers alike", () => {
    expect(memberUpdateText(update, BASE)).toBe(`The Office \\(2005\\) has the missing episodes now.${link}`)
    expect(memberUpdateText({ ...update, own: false }, BASE)).toBe(`The Office \\(2005\\) has the missing episodes now.${link}`)
  })

  it("says a better copy came, or that none did, and where the member who reported it can ask the server admin", () => {
    const heat = { ...update, action: "BETTER_COPY" as const, title: "Heat (1995)" }
    expect(memberUpdateText(heat, BASE)).toBe(`A better copy of Heat \\(1995\\) is on the server now.${link}`)
    expect(memberUpdateText({ ...heat, status: "CLOSED" }, BASE)).toBe(
      `We looked for a better copy of Heat \\(1995\\), but there isn't one right now. If it still looks poor, you can ask the server admin from your reports.${link}`
    )
    expect(memberUpdateText({ ...heat, status: "CLOSED", own: false }, BASE)).toBe(`We looked for a better copy of Heat \\(1995\\), but there isn't one right now.${link}`)
    expect(memberUpdateText({ ...heat, action: undefined }, BASE)).toBe(`Heat \\(1995\\) is fixed.${link}`)
  })

  it("says Plex has the right title, or read the details again", () => {
    const heat = { ...update, title: "Heat (1995)" }
    expect(memberUpdateText({ ...heat, action: "FIX_MATCH" }, BASE)).toBe(`Heat \\(1995\\) has the right title and poster in Plex now.${link}`)
    expect(memberUpdateText({ ...heat, action: "REFRESH" }, BASE)).toBe(`Plex has read the details of Heat \\(1995\\) again.${link}`)
  })

  it("says a swap or a removal brought in another copy, and asks the member who reported it whether it plays", () => {
    const heat = { ...update, title: "Heat (1995)" }
    expect(memberUpdateText({ ...heat, action: "SWAP" }, BASE)).toBe(`A different copy of Heat \\(1995\\) is on the server now. Does it play? Tell us on your reports.${link}`)
    expect(memberUpdateText({ ...heat, action: "REMOVE_AND_SEARCH" }, BASE)).toBe(`A new copy of Heat \\(1995\\) is on the server now. Does it play? Tell us on your reports.${link}`)
    expect(memberUpdateText({ ...heat, own: false, action: "SWAP" }, BASE)).toBe(`A different copy of Heat \\(1995\\) is on the server now.${link}`)
  })

  it("says the server admin fixed or closed it, and mentions a note only to the member who reported it", () => {
    expect(memberUpdateText({ ...update, by: "admin", hasNote: true }, BASE)).toBe(`The server admin fixed The Office \\(2005\\). The server admin left you a note.${link}`)
    expect(memberUpdateText({ ...update, status: "CLOSED", by: "admin" }, BASE)).toBe(`The server admin closed your report about The Office \\(2005\\).${link}`)
    expect(memberUpdateText({ ...update, own: false, status: "CLOSED", by: "admin", hasNote: true }, BASE)).toBe(
      `The server admin closed the report you follow about The Office \\(2005\\).${link}`
    )
  })

  it("tells a follower the member who made it cancelled it", () => {
    expect(memberUpdateText({ ...update, own: false, status: "CLOSED", by: "reporter" }, BASE)).toBe(
      `The report you follow about The Office \\(2005\\) was cancelled by the member who made it.${link}`
    )
  })
})

