/**
 * What `/report` shows in Discord at each step: the words, the select menus
 * and the buttons. Titles come from Plex and go through `plainDiscordText`
 * in message text; select options and button labels are plain text already.
 * The words match the web sheet's (`lib/problem-reports/taxonomy.ts`,
 * `lib/problem-reports/consequence.ts`).
 *
 * @module lib/discord/commands/report/messages
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js"

import { plainDiscordText } from "@/lib/discord/plain-text"
import { getBaseUrl } from "@/lib/env"
import { answerWords } from "@/lib/problem-reports/answers"
import type { MemberFixAction } from "@/lib/problem-reports/fixes"
import type { FoundTitle } from "@/lib/problem-reports/search"
import type { ReportOutcome } from "@/lib/problem-reports/service"
import { kindsFor, problemLabel, problemsOf, type ProblemCode, type ProblemKind, type ReportableType } from "@/lib/problem-reports/taxonomy"

import { reportIds } from "./ids"

/** Discord's limits: options in one select menu, a label's length, buttons in one row and rows in one message. */
const MAX_OPTIONS = 25
const LABEL_MAX = 100
const BUTTON_LABEL_MAX = 80
const ROW_BUTTONS = 5
const MAX_ROWS = 5
const TITLE_MAX = 120

const TYPE_LABELS: Record<ReportableType, string> = { movie: "Movie", show: "Show", episode: "Episode" }

type Row = ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>

/** One step's message: its words and its controls. */
export interface StepMessage {
  content: string
  components: Row[]
}

/** A step with words only: its controls are gone. */
export const words = (content: string): StepMessage => ({ content, components: [] })
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
const reportUrl = (ratingKey?: string) => `${getBaseUrl()}/report${ratingKey ? `?item=${encodeURIComponent(ratingKey)}` : ""}`

/** The member's search found titles: which one has the problem. */
export function chooseTitle(titles: readonly FoundTitle[]): StepMessage {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(reportIds.title())
    .setPlaceholder("Choose the title")
    .addOptions(titles.slice(0, MAX_OPTIONS).map((title) => ({ label: cut(title.title, LABEL_MAX), value: title.ratingKey, description: TYPE_LABELS[title.type] })))
  return { content: "Which title has the problem?", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] }
}

/** Step 1, as on the web: what kind of problem. */
export function chooseKind(title: string, type: ReportableType, ratingKey: string): StepMessage {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(reportIds.kind(ratingKey))
    .setPlaceholder("Choose what's wrong")
    .addOptions(kindsFor(type).map((kind) => ({ label: kind.label, value: kind.id })))
  return {
    content: `What's wrong with ${plainDiscordText(title, TITLE_MAX)}?`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  }
}

/** Step 2: which problem of that kind. */
export function chooseProblem(title: string, kind: ProblemKind, ratingKey: string): StepMessage {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(reportIds.problem(ratingKey, kind))
    .setPlaceholder("Choose the problem")
    .addOptions(problemsOf(kind).map((problem) => ({ label: problem.label, value: problem.code })))
  return {
    content: `Which problem does ${plainDiscordText(title, TITLE_MAX)} have?`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
  }
}

const button = (customId: string, label: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Primary))

/**
 * The confirm: the problem, the web's playback tip when the member's Plex app
 * converted their last play, what happens next, the allowance or why it goes
 * to the server admin, and the web's button (`consequence`). A swap's button
 * says the member chose it.
 */
export function confirmProblem(
  title: string,
  problem: ProblemCode,
  ratingKey: string,
  next: { line: string; button: string; note: string | null; swap: boolean; tip: boolean }
): StepMessage {
  const tip = next.tip ? `\nYour Plex app converted this video while you watched, which lowers quality and can cause buffering. Get the best picture: ${getBaseUrl()}/help#playback` : ""
  const note = next.note ? `\n${next.note}` : ""
  return {
    content: `${plainDiscordText(title, TITLE_MAX)}: ${problemLabel(problem)}.${tip}\n${next.line}${note}`,
    components: [button((next.swap ? reportIds.swap : reportIds.send)(ratingKey, problem), next.button)],
  }
}

/** What a fix that started is doing, as the web's sheet says it. */
const FIXING: Record<MemberFixAction, string> = {
  BETTER_COPY: "We'll look for a better copy now. The one you have keeps playing, and if there isn't a better one, nothing changes.",
  LOOK_FOR_MISSING: "We'll look for the missing episodes now. Nothing is removed.",
  REFRESH: "We'll check the details and ask Plex to read them again.",
  SWAP: "We'll find a different copy and swap it in. The one you have keeps playing until the new one is ready.",
  FIX_MATCH: "We'll fix the title and poster in Plex. The file stays the same.",
}

/** A show's problem is with an episode, which the member picks on the web. */
export const chooseEpisodeOnWeb = (ratingKey: string) => words(`Choose the episode with the problem on the web: ${reportUrl(ratingKey)}`)

/** "Something else" needs a note, which the member writes on the web. */
export const writeNoteOnWeb = (ratingKey: string) => words(`Tell the server admin what's wrong on the web: ${reportUrl(ratingKey)}`)

/**
 * What the report led to: the server admin, the title's open report, a fix
 * that started, or an answer instead of a report, with Send to the server
 * admin when the answer is that the file is the best copy. `day` writes a
 * date; `sentAs` is what was sent, for that button.
 */
export function sent(result: ReportOutcome, day: (iso: string) => string, sentAs: { ratingKey: string; problem: ProblemCode }): StepMessage {
  switch (result.outcome) {
    case "answered":
      return result.answer.kind === "BEST_COPY"
        ? { content: answerWords(result.answer, day), components: [button(reportIds.admin(sentAs.ratingKey, sentAs.problem), "Send to the server admin")] }
        : words(answerWords(result.answer, day))
    case "fixing":
      return words(`${FIXING[result.action]} Follow it on the web: ${reportUrl()}`)
    case "joined":
      return words(`This title already had an open report, so yours was added to it. Follow it on the web: ${reportUrl()}`)
    case "reported":
      return words(`Sent to the server admin. Follow it on the web: ${reportUrl()}`)
  }
}

export const nothingFound = (query: string) => words(`Nothing in your libraries matches "${plainDiscordText(query, 80)}". Try another title.`)

/**
 * `/watching`'s Report a problem buttons, one per stream the member may
 * report, for the member who ran it only: the button carries their Discord
 * id and the stream's rating key.
 */
export function watchingReportRows(discordUserId: string, streams: readonly { ratingKey: string; title: string }[]): ActionRowBuilder<ButtonBuilder>[] {
  const buttons = streams.slice(0, ROW_BUTTONS * MAX_ROWS).map((stream) =>
    new ButtonBuilder()
      .setCustomId(reportIds.watching(discordUserId, stream.ratingKey))
      .setLabel(cut(`Report a problem with ${stream.title}`, BUTTON_LABEL_MAX))
      .setStyle(ButtonStyle.Secondary)
  )
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  for (let start = 0; start < buttons.length; start += ROW_BUTTONS) {
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(start, start + ROW_BUTTONS)))
  }
  return rows
}
