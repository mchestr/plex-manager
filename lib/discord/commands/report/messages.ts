/**
 * What `/report` shows in Discord at each step: the words, the select menus
 * and the buttons. Titles come from Plex and go through `plainDiscordText`
 * in message text; select options and button labels are plain text already.
 * The words match the web sheet's (`lib/problem-reports/taxonomy.ts`).
 *
 * @module lib/discord/commands/report/messages
 */

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from "discord.js"

import { plainDiscordText } from "@/lib/discord/plain-text"
import { getBaseUrl } from "@/lib/env"
import type { FoundTitle } from "@/lib/problem-reports/search"
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

/** The confirm: the problem, what happens next, and the web's button. */
export function confirmProblem(title: string, problem: ProblemCode, ratingKey: string): StepMessage {
  const send = new ButtonBuilder().setCustomId(reportIds.send(ratingKey, problem)).setLabel("Send to the server admin").setStyle(ButtonStyle.Primary)
  return {
    content: `${plainDiscordText(title, TITLE_MAX)}: ${problemLabel(problem)}.\nThe server admin will take a look. We'll message you when it's done.`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(send)],
  }
}

/** A show's problem is with an episode, which the member picks on the web. */
export const chooseEpisodeOnWeb = (ratingKey: string) => words(`Choose the episode with the problem on the web: ${reportUrl(ratingKey)}`)

/** "Something else" needs a note, which the member writes on the web. */
export const writeNoteOnWeb = (ratingKey: string) => words(`Tell the server admin what's wrong on the web: ${reportUrl(ratingKey)}`)

/** The report went to the server admin, or joined the title's open report. */
export const sent = (joined: boolean) =>
  words(
    joined
      ? `This title already had an open report, so yours was added to it. Follow it on the web: ${reportUrl()}`
      : `Sent to the server admin. Follow it on the web: ${reportUrl()}`
  )

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
