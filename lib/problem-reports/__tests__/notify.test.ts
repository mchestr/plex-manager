/**
 * The server admin's Discord alert text: one report, or a digest of a
 * member's reports with the first five listed, each with its problem and
 * link, the member's name and the titles as plain text, and no link embeds.
 */

import { adminAlertText } from "@/lib/problem-reports/notify"

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
})
