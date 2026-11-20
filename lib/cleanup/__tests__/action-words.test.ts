/** Every deletion text (TS 4.4, X14, UX 8.4, 8.6, 8.7): each action, both exclusion values, both counts, with and without a size. */

import {
  ACTION_LABELS,
  ACTION_PHRASES,
  actionWords,
  approveDescription,
  buttonNoteText,
  CHECK_SENTENCE,
  impactActionLine,
  modeCardText,
  plural,
  titleList,
} from "@/lib/cleanup/action-words"
import { ACTION_IDS, type ActionId, type Level } from "@/lib/validations/cleanup-vocabulary"

/** An arrow, a middle dot, or the old feature name, none of which copy may hold. */
const BANNED = new RegExp(["\\u2192", "\\u00b7", `${"Wr"}apped`].join("|"))

const levelOf = (action: ActionId): Level => (action.startsWith("movie.") ? "movie" : action.startsWith("show.") ? "show" : "season")

describe("plural", () => {
  it("gives the singular at 1 and the plural otherwise", () => {
    expect(plural(1, "movie")).toBe("1 movie")
    expect(plural(2, "movie")).toBe("2 movies")
    expect(plural(1, "season")).toBe("1 season")
    expect(plural(0, "show")).toBe("0 shows")
    expect(plural(1, "title")).toBe("1 title")
    expect(plural(52, "title")).toBe("52 titles")
    expect(plural(1, "item")).toBe("1 item")
  })
})

describe("actionWords", () => {
  it("gives the movie delete strings of UX 8.6, with the exclusion and without", () => {
    expect(actionWords("movie.delete", { exclusion: true, count: 6, level: "movie", size: "22.4 GB" })).toEqual({
      service: "Radarr",
      dialogTitle: "Delete 6 movies and their files in Radarr?",
      dialogSentence: "Each movie also gets an import list exclusion.",
      confirmLabel: "Delete 6 movies",
      footerLabel: "Approve and delete 6 movies...",
      thenSentence: "Radarr deletes the movie and its 22.4 GB file, and adds an import list exclusion.",
      modeSentence: "Radarr deletes the movies and their files, and adds an import list exclusion for each",
    })
    expect(actionWords("movie.delete", { exclusion: false, count: 1, level: "movie" })).toEqual({
      service: "Radarr",
      dialogTitle: "Delete 1 movie and its files in Radarr?",
      dialogSentence: null,
      confirmLabel: "Delete 1 movie",
      footerLabel: "Approve and delete 1 movie...",
      thenSentence: "Radarr deletes the movie and its file.",
      modeSentence: "Radarr deletes the movies and their files",
    })
  })

  it("gives the show delete strings", () => {
    const words = actionWords("show.delete", { exclusion: true, count: 6, level: "show", size: "1.24 TB" })
    expect(words.dialogTitle).toBe("Delete 6 shows and their files in Sonarr?")
    expect(words.footerLabel).toBe("Approve and delete 6 shows...")
    expect(words.thenSentence).toBe("Sonarr deletes the show and its 1.24 TB of files, and adds an import list exclusion.")
    expect(actionWords("show.delete", { exclusion: false, count: 1, level: "show" }).thenSentence).toBe("Sonarr deletes the show and its files.")
  })

  it("gives the unmonitor strings, and never an exclusion", () => {
    for (const exclusion of [true, false]) {
      expect(actionWords("movie.unmonitorDeleteFiles", { exclusion, count: 2, level: "movie", size: "9.1 GB" })).toEqual({
        service: "Radarr",
        dialogTitle: "Delete the files of 2 movies in Radarr?",
        dialogSentence: "Radarr keeps each movie and stops monitoring it, so it does not download it again.",
        confirmLabel: "Delete the files of 2 movies",
        footerLabel: "Approve and delete the files of 2 movies...",
        thenSentence: "Radarr stops monitoring the movie and deletes its 9.1 GB file. The Radarr record stays.",
        modeSentence: "Radarr deletes the files of the movies and stops monitoring them",
      })
    }
    expect(actionWords("show.unmonitorDeleteFiles", { exclusion: false, count: 1, level: "show" })).toMatchObject({
      dialogTitle: "Delete the files of 1 show in Sonarr?",
      thenSentence: "Sonarr stops monitoring the show and deletes its files. The Sonarr record stays.",
      modeSentence: "Sonarr deletes the files of the shows and stops monitoring them",
    })
  })

  it("gives the season strings", () => {
    expect(actionWords("season.unmonitorDeleteFiles", { exclusion: false, count: 33, level: "season", size: "48 GB" })).toEqual({
      service: "Sonarr",
      dialogTitle: "Delete the files of 33 seasons in Sonarr?",
      dialogSentence: "Sonarr keeps each show and stops monitoring these seasons.",
      confirmLabel: "Delete the files of 33 seasons",
      footerLabel: "Approve and delete the files of 33 seasons...",
      thenSentence: "Sonarr stops monitoring the season and deletes its 48 GB of files. The show stays in Sonarr.",
      modeSentence: "Sonarr deletes the files of the seasons and stops monitoring them",
    })
  })

  it("keeps whole sentences for every action, both exclusion values, both counts, with and without size", () => {
    for (const action of ACTION_IDS) {
      for (const exclusion of [true, false]) {
        for (const count of [1, 52]) {
          for (const size of [undefined, "1.5 TB"]) {
            const level = levelOf(action)
            const words = actionWords(action, { exclusion, count, level, size })
            const texts = [
              ...Object.values(words).filter((t): t is string => typeof t === "string"),
              modeCardText(words, "Dec 8", level),
              buttonNoteText(words),
              impactActionLine(action, { exclusion, count, level, size }),
              ...approveDescription(action, { count, level, size }, { upTo: "1.5 TB", budgetItems: 20, budgetSize: "500 GB", from: "Dec 8", to: "Dec 10", exclusionCount: exclusion ? count : 0 }),
            ]
            for (const text of texts) {
              expect(text).not.toContain(". inside")
              expect(text).not.toMatch(/\.\s+[a-z]/)
              expect(text).not.toMatch(BANNED)
            }
            expect(words.modeSentence).not.toMatch(/\.$/)
            expect(words.thenSentence).toMatch(/\.$/)
            const exclusionWords = [words.dialogSentence ?? "", words.thenSentence, words.modeSentence].join(" ")
            expect(exclusionWords.includes("import list exclusion")).toBe(exclusion && action.endsWith(".delete"))
            expect(words.thenSentence.includes(size ?? "no size")).toBe(size !== undefined)
          }
        }
      }
    }
  })

  it("makes the mode card and the button note whole sentences (TS 4.4)", () => {
    const words = actionWords("movie.delete", { exclusion: true, count: 6, level: "movie" })
    expect(modeCardText(words, "Dec 8", "movie")).toBe(
      "On Dec 8 Radarr deletes the movies and their files, and adds an import list exclusion for each, inside the daily budget. " +
        "You can still exclude or postpone any movie before then.",
    )
    expect(buttonNoteText(words)).toBe(
      "At the leave date: Automatic. Radarr deletes the movies and their files, and adds an import list exclusion for each, inside the daily budget.",
    )
    const seasons = actionWords("season.unmonitorDeleteFiles", { exclusion: false, count: 2, level: "season" })
    expect(buttonNoteText(seasons)).toBe("At the leave date: Automatic. Sonarr deletes the files of the seasons and stops monitoring them, inside the daily budget.")
  })

  it("gives the impact line with thenSentence at 1 and modeSentence above (UX 8.6)", () => {
    expect(impactActionLine("movie.delete", { exclusion: false, count: 1, level: "movie" })).toBe(
      "1 movie in Leaving soon gets the new action: Radarr deletes the movie and its file.",
    )
    expect(impactActionLine("movie.delete", { exclusion: false, count: 2, level: "movie" })).toBe(
      "2 movies in Leaving soon get the new action: Radarr deletes the movies and their files.",
    )
  })
})

describe("approveDescription", () => {
  const budget = { upTo: "1.24 TB", budgetItems: 20, budgetSize: "500 GB", from: "Dec 8", to: "Dec 10", exclusionCount: 0 }

  it("gives the delete description with the exclusion for all, some or none (UX 8.6)", () => {
    expect(approveDescription("show.delete", { count: 6, level: "show" }, { ...budget, exclusionCount: 6 })).toEqual([
      "Up to 1.24 TB. Sonarr deletes them inside the daily budget of 20 items and 500 GB, from Dec 8 to Dec 10, largest first.",
      "Each show also gets an import list exclusion.",
      CHECK_SENTENCE,
    ])
    expect(approveDescription("show.delete", { count: 6, level: "show" }, { ...budget, exclusionCount: 2 })[1]).toBe("2 of them also get an import list exclusion.")
    expect(approveDescription("show.delete", { count: 6, level: "show" }, { ...budget, exclusionCount: 1 })[1]).toBe("1 of them also gets an import list exclusion.")
    expect(approveDescription("movie.delete", { count: 6, level: "movie" }, { ...budget, budgetItems: 1 })).toEqual([
      "Up to 1.24 TB. Radarr deletes them inside the daily budget of 1 item and 500 GB, from Dec 8 to Dec 10, largest first.",
      CHECK_SENTENCE,
    ])
    expect(CHECK_SENTENCE).toBe("Before each delete, the app checks again for plays, Keeps, new requests and rule changes. You cannot undo a delete.")
  })

  it("gives the unmonitor and season descriptions, with no exclusion", () => {
    expect(approveDescription("movie.unmonitorDeleteFiles", { count: 3, level: "movie" }, { ...budget, exclusionCount: 3 })).toEqual([
      "Up to 1.24 TB. Radarr keeps each movie and stops monitoring it, so it does not download it again. " +
        "It deletes the files inside the daily budget, from Dec 8 to Dec 10, largest first.",
      CHECK_SENTENCE,
    ])
    expect(approveDescription("season.unmonitorDeleteFiles", { count: 33, level: "season" }, budget)[0]).toBe(
      "Up to 1.24 TB. Sonarr keeps each show and stops monitoring these seasons. It deletes the files inside the daily budget, from Dec 8 to Dec 10, largest first.",
    )
  })
})

describe("titleList", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Invented title ${i + 1}`, size: `${n - i} GB` }))

  it("lists 10 titles, then 'and {N} more'", () => {
    expect(titleList(rows(2))).toEqual(["Invented title 1, 2 GB", "Invented title 2, 1 GB"])
    expect(titleList(rows(10))).toHaveLength(10)
    const cut = titleList(rows(13))
    expect(cut).toHaveLength(11)
    expect(cut[9]).toBe("Invented title 10, 4 GB")
    expect(cut[10]).toBe("and 3 more")
    expect(titleList(rows(8), 6)[6]).toBe("and 2 more")
    expect(titleList([])).toEqual([])
  })
})

describe("labels and phrases", () => {
  it("gives the Then token of UX 8.4 and the plain words phrase of TS 4.4", () => {
    expect(ACTION_LABELS["movie.delete"]).toBe("delete the movie and its files in Radarr")
    expect(ACTION_LABELS["season.unmonitorDeleteFiles"]).toBe("unmonitor the season and delete its files in Sonarr")
    expect(ACTION_PHRASES["show.unmonitorDeleteFiles"]).toBe("unmonitor each show and delete its files in Sonarr")
    expect(Object.keys(ACTION_LABELS)).toEqual([...ACTION_IDS])
    expect(Object.keys(ACTION_PHRASES)).toEqual([...ACTION_IDS])
  })
})
