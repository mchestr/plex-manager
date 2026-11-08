/**
 * Every text that names a deletion (TS 4.4, X14, UX 8.4, 8.6 and 8.7): the
 * approve dialog, the batch footer, the Then line, the timeline, the mode
 * card, the button note and the impact line. The text is the consent for an
 * irreversible action, so it has one home. Also `plural()` for every
 * "{N} {items}" string. Client-safe.
 *
 * @module lib/cleanup/action-words
 */

import { type Noun, nounWord, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { type ActionId, LEVEL_ARR, type Level } from "@/lib/validations/cleanup-vocabulary"

/** "1 movie", "2 movies", "1 season", "3 titles". */
export const plural = (count: number, noun: Noun): string => `${count} ${nounWord(count, noun)}`

/** The action token of the Then fieldset (UX 8.4). */
export const ACTION_LABELS: Record<ActionId, string> = {
  "movie.delete": "delete the movie and its files in Radarr",
  "movie.unmonitorDeleteFiles": "unmonitor the movie and delete its files in Radarr",
  "show.delete": "delete the show and its files in Sonarr",
  "show.unmonitorDeleteFiles": "unmonitor the show and delete its files in Sonarr",
  "season.unmonitorDeleteFiles": "unmonitor the season and delete its files in Sonarr",
}

/** The Then phrase of the plain words (TS 4.4 item 3). */
export const ACTION_PHRASES: Record<ActionId, string> = {
  "movie.delete": "delete each movie and its files in Radarr",
  "movie.unmonitorDeleteFiles": "unmonitor each movie and delete its files in Radarr",
  "show.delete": "delete each show and its files in Sonarr",
  "show.unmonitorDeleteFiles": "unmonitor each show and delete its files in Sonarr",
  "season.unmonitorDeleteFiles": "unmonitor each season and delete its files in Sonarr",
}

export interface ActionWordsOptions {
  /** The import list exclusion is on. Only delete actions use it. */
  exclusion: boolean
  count: number
  level: Level
  /** A `formatBytes()` string. */
  size?: string
}

export interface ActionWords {
  service: string
  dialogTitle: string
  /** Null for a delete action without the exclusion. */
  dialogSentence: string | null
  confirmLabel: string
  footerLabel: string
  /** One title: the Why Sheet Then line and the timeline. Ends with a period. */
  thenSentence: string
  /** Plural, with no final period: the mode card and the button note. */
  modeSentence: string
}

type Kind = "delete" | "unmonitor" | "season"
const kindOf = (action: ActionId): Kind => (action.endsWith(".delete") ? "delete" : action.startsWith("season.") ? "season" : "unmonitor")

/** The words of one action for `count` items (TS 4.4 table). */
export function actionWords(action: ActionId, { exclusion, count, level, size }: ActionWordsOptions): ActionWords {
  const service = SERVICE_NAMES[LEVEL_ARR[level]]
  const item = nounWord(1, level)
  const items = nounWord(2, level)
  const n = plural(count, level)
  const itsFiles = `its ${size ? `${size} ` : ""}${level === "movie" ? "file" : size ? "of files" : "files"}`
  switch (kindOf(action)) {
    case "delete":
      return {
        service,
        dialogTitle: `Delete ${n} and ${count === 1 ? "its" : "their"} files in ${service}?`,
        dialogSentence: exclusion ? `Each ${item} also gets an import list exclusion.` : null,
        confirmLabel: `Delete ${n}`,
        footerLabel: `Approve and delete ${n}...`,
        thenSentence: `${service} deletes the ${item} and ${itsFiles}${exclusion ? ", and adds an import list exclusion" : ""}.`,
        modeSentence: `${service} deletes the ${items} and their files${exclusion ? ", and adds an import list exclusion for each" : ""}`,
      }
    case "unmonitor":
      return {
        service,
        dialogTitle: `Delete the files of ${n} in ${service}?`,
        dialogSentence: `${service} keeps each ${item} and stops monitoring it, so it does not download it again.`,
        confirmLabel: `Delete the files of ${n}`,
        footerLabel: `Approve and delete the files of ${n}...`,
        thenSentence: `${service} stops monitoring the ${item} and deletes ${itsFiles}. The ${service} record stays.`,
        modeSentence: `${service} deletes the files of the ${items} and stops monitoring them`,
      }
    case "season":
      return {
        service,
        dialogTitle: `Delete the files of ${n} in ${service}?`,
        dialogSentence: `${service} keeps each show and stops monitoring these seasons.`,
        confirmLabel: `Delete the files of ${n}`,
        footerLabel: `Approve and delete the files of ${n}...`,
        thenSentence: `${service} stops monitoring the season and deletes ${itsFiles}. The show stays in ${service}.`,
        modeSentence: `${service} deletes the files of the seasons and stops monitoring them`,
      }
  }
}

/** The Automatic mode card (UX 8.7): "On {day} {modeSentence}, inside the daily budget. You can still ..." */
export function modeCardText(words: ActionWords, day: string, level: Level): string {
  return `On ${day} ${words.modeSentence}, inside the daily budget. You can still exclude or postpone any ${nounWord(1, level)} before then.`
}

/** The Automatic button note (UX 8.7): "At the leave date: Automatic. {modeSentence}, inside the daily budget." */
export const buttonNoteText = (words: ActionWords): string => `At the leave date: Automatic. ${words.modeSentence}, inside the daily budget.`

/** The impact dialog line (UX 8.6): `thenSentence` at 1, `modeSentence` above. Use it only above 0. */
export function impactActionLine(action: ActionId, options: ActionWordsOptions): string {
  const words = actionWords(action, options)
  if (options.count === 1) return `1 ${nounWord(1, options.level)} in Leaving soon gets the new action: ${words.thenSentence}`
  return `${plural(options.count, options.level)} in Leaving soon get the new action: ${words.modeSentence}.`
}

export interface BudgetWords {
  /** The selected bytes, a `formatBytes()` string. */
  upTo: string
  budgetItems: number
  /** The daily space budget, a `formatBytes()` string. */
  budgetSize: string
  from: string
  to: string
  /** The selected items with the exclusion. Delete actions only. */
  exclusionCount: number
}

/** The check sentence of every approve dialog (UX 8.6). */
export const CHECK_SENTENCE = "Before each delete, the app checks again for plays, Keeps, new requests and rule changes. You cannot undo a delete."

/** The approve dialog description of UX 8.6, sentence by sentence, for the least careful action of the selection (E35). */
export function approveDescription(action: ActionId, options: Omit<ActionWordsOptions, "exclusion">, budget: BudgetWords): string[] {
  const { count } = options
  const words = actionWords(action, { ...options, exclusion: budget.exclusionCount > 0 })
  const days = `from ${budget.from} to ${budget.to}, largest first.`
  if (kindOf(action) !== "delete") return [`Up to ${budget.upTo}. ${words.dialogSentence} It deletes the files inside the daily budget, ${days}`, CHECK_SENTENCE]
  const lines = [`Up to ${budget.upTo}. ${words.service} deletes them inside the daily budget of ${plural(budget.budgetItems, "item")} and ${budget.budgetSize}, ${days}`]
  const k = budget.exclusionCount
  if (k >= count && words.dialogSentence) lines.push(words.dialogSentence)
  else if (k > 0) lines.push(`${k} of them also ${k === 1 ? "gets" : "get"} an import list exclusion.`)
  return [...lines, CHECK_SENTENCE]
}

/** The approve dialog's title list (UX 8.6): "{title}, {size}" for the first `max`, then "and {N} more". */
export function titleList(rows: readonly { title: string; size: string }[], max = 10): string[] {
  const lines = rows.slice(0, max).map((row) => `${row.title}, ${row.size}`)
  return rows.length > max ? [...lines, `and ${rows.length - max} more`] : lines
}
