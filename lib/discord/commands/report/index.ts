/**
 * `/report` in Discord: report a problem with a title, as on the web
 * (docs/problem-reports.md). Every reply is ephemeral.
 *
 * ```
 * /report title:<q>
 *   ├─ not linked, or no active membership ─► the link nudge (requireLinkedUser)
 *   ├─ the switch is off ─► "Problem reports are off."
 *   ├─ search, kept to the member's libraries (searchMemberTitles)
 *   │    none ─► "Nothing in your libraries matches ..."
 *   │    one ─► the kind step     several ─► choose the title (select)
 * title chosen, or Report a problem on /watching (its own member only)
 *   └─ the title read again from Plex and checked against their libraries (readMemberItem)
 *        a show ─► a link to /report?item=<ratingKey> to choose the episode
 *        else ─► what kind (select) ─► which problem (select)
 *                  "Something else" ─► a link to the web, which takes the note
 *                  ─► the confirm ─► Send to the server admin ─► reportProblem (the web's service)
 * ```
 *
 * Each step's `custom_id` carries what the next needs (`./ids.ts`); nothing
 * is parked between steps. Each step checks the member is linked and
 * entitled (the router does too), and reads the title again, so a title
 * outside their libraries never shows. The send goes through
 * `lib/problem-reports/service.ts`: the switch, entitlement, rate limits,
 * the library check and the one open report per title. There is no
 * autocomplete: the router checks no user for one, and a library check
 * would not fit in its 3 seconds.
 *
 * @module lib/discord/commands/report
 */

import { MessageFlags, type MessageComponentInteraction } from "discord.js"

import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { memberLibraryAccess, readMemberItem } from "@/lib/problem-reports/access"
import { refusalCopy, REFUSALS } from "@/lib/problem-reports/refusals"
import { searchMemberTitles } from "@/lib/problem-reports/search"
import { reportProblem } from "@/lib/problem-reports/service"
import { getProblemReportSettings } from "@/lib/problem-reports/settings"
import { needsNote, PROBLEM_KINDS, PROBLEMS, type ProblemCode, type ProblemKind, type ReportableType } from "@/lib/problem-reports/taxonomy"
import { reportTitle } from "@/lib/problem-reports/title"
import { serverZone } from "@/lib/utils/server-zone"
import { ratingKeySchema } from "@/lib/validations/params"

import { COMMAND_DEFINITIONS, REPORT_PREFIX } from "../definitions"
import type { ComponentHandler, InteractionContext, SlashCommand } from "../registry"
import { buildNotLinkedMessage, requireLinkedUser } from "../require-linked-user"
import { parseReportId } from "./ids"
import { chooseEpisodeOnWeb, chooseKind, chooseProblem, chooseTitle, confirmProblem, nothingFound, sent, words, writeNoteOnWeb, type StepMessage } from "./messages"

/** Titles a search offers: one select menu's worth. */
const RESULT_LIMIT = 25

const EXPIRED = words("That choice is no longer valid. Run /report again.")

type Edit = (message: StepMessage) => Promise<unknown>

/** The member behind a component interaction, or null when they are no longer linked and entitled. */
async function memberOf(interaction: MessageComponentInteraction): Promise<string | null> {
  const { verifyDiscordUser } = await import("@/lib/discord/services")
  const verified = await verifyDiscordUser(interaction.user.id)
  return verified.linked && verified.entitled && verified.user ? verified.user.id : null
}

/** The title as the member may see it, or the step's refusal. */
async function readTitle(edit: Edit, userId: string, ratingKey: string) {
  const member = await readMemberItem(userId, ratingKey)
  if (!member.ok) {
    await edit(words(refusalCopy(member.reason)))
    return null
  }
  return { title: reportTitle(member.item), type: member.item.type as ReportableType }
}

/** After a title is chosen: a show goes to the web for its episode, anything else to the kind step. */
async function offerKinds(edit: Edit, userId: string, ratingKey: string): Promise<void> {
  const read = await readTitle(edit, userId, ratingKey)
  if (!read) return
  await edit(read.type === "show" ? chooseEpisodeOnWeb(ratingKey) : chooseKind(read.title, read.type, ratingKey))
}

async function handleReport(ctx: InteractionContext): Promise<void> {
  const { interaction } = ctx
  const user = await requireLinkedUser(ctx, { action: "report a problem" })
  if (!user) return
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const edit: Edit = (message) => interaction.editReply(message)
  if (!(await getProblemReportSettings()).enabled) return void (await edit(words(REFUSALS.OFF[1])))

  const query = interaction.options.getString("title", true).trim()
  const server = await getActivePlexServerConfig()
  const access = server ? await memberLibraryAccess(user.id, server) : null
  const titles = server && access ? await searchMemberTitles(server, access, query, RESULT_LIMIT) : null
  if (titles === null) return void (await edit(words(REFUSALS.UNAVAILABLE[1])))
  if (titles.length === 0) return void (await edit(nothingFound(query)))
  if (titles.length === 1) return offerKinds(edit, user.id, titles[0].ratingKey)
  await edit(chooseTitle(titles))
}

/** The value a select menu sent, or null for anything else. */
const chosen = (interaction: MessageComponentInteraction): string | null =>
  interaction.isStringSelectMenu() && interaction.values.length === 1 ? interaction.values[0] : null

const isKind = (value: string | null): value is ProblemKind => PROBLEM_KINDS.some((kind) => kind.id === value)

/** A step on the flow's own message: acknowledge, check the member, then edit the message. */
async function onStep(interaction: MessageComponentInteraction, run: (edit: Edit, userId: string) => Promise<unknown>): Promise<void> {
  await interaction.deferUpdate()
  const edit: Edit = (message) => interaction.editReply(message)
  const userId = await memberOf(interaction)
  if (!userId) return void (await edit(words(buildNotLinkedMessage("report a problem"))))
  await run(edit, userId)
}

/** Report a problem on `/watching`: only the member whose stream it is, in a new ephemeral message. */
async function onWatching(interaction: MessageComponentInteraction, ownerId: string, ratingKey: string): Promise<void> {
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: "This button belongs to someone else.", flags: MessageFlags.Ephemeral })
    return
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral })
  const edit: Edit = (message) => interaction.editReply(message)
  const userId = await memberOf(interaction)
  if (!userId) return void (await edit(words(buildNotLinkedMessage("report a problem"))))
  if (!(await getProblemReportSettings()).enabled) return void (await edit(words(REFUSALS.OFF[1])))
  await offerKinds(edit, userId, ratingKey)
}

async function onKind(edit: Edit, userId: string, ratingKey: string, kind: string | null): Promise<void> {
  if (!isKind(kind)) return void (await edit(EXPIRED))
  if (kind === "other") return void (await edit(writeNoteOnWeb(ratingKey)))
  const read = await readTitle(edit, userId, ratingKey)
  if (read) await edit(chooseProblem(read.title, kind, ratingKey))
}

async function onProblem(edit: Edit, userId: string, ratingKey: string, kind: ProblemKind, problem: string | null): Promise<void> {
  if (!problem || !Object.hasOwn(PROBLEMS, problem) || PROBLEMS[problem as ProblemCode].kind !== kind) return void (await edit(EXPIRED))
  if (needsNote(problem as ProblemCode)) return void (await edit(writeNoteOnWeb(ratingKey)))
  const read = await readTitle(edit, userId, ratingKey)
  if (read) await edit(confirmProblem(read.title, problem as ProblemCode, ratingKey))
}

async function onSend(edit: Edit, userId: string, ratingKey: string, problem: ProblemCode): Promise<void> {
  const result = await reportProblem({ userId, ratingKey, problem, note: null })
  if (!result.ok) return void (await edit(words(refusalCopy(result.refusal, result.retryAfterSec))))
  // Discord has no zone of the member's, so a date is the server's
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: await serverZone() })
  await edit(sent(result, (iso) => day.format(new Date(iso))))
}

/** Routes a `/report` component to its step. */
async function handleStep(interaction: MessageComponentInteraction): Promise<void> {
  const step = parseReportId(interaction.customId)
  if (!step) {
    await interaction.reply({ content: EXPIRED.content, flags: MessageFlags.Ephemeral })
    return
  }
  switch (step.step) {
    case "watching":
      return onWatching(interaction, step.discordUserId, step.ratingKey)
    case "title": {
      const ratingKey = chosen(interaction)
      return onStep(interaction, (edit, userId) => (ratingKeySchema.safeParse(ratingKey).success && ratingKey ? offerKinds(edit, userId, ratingKey) : edit(EXPIRED)))
    }
    case "kind":
      return onStep(interaction, (edit, userId) => onKind(edit, userId, step.ratingKey, chosen(interaction)))
    case "problem":
      return onStep(interaction, (edit, userId) => onProblem(edit, userId, step.ratingKey, step.kind, chosen(interaction)))
    case "send":
      return onStep(interaction, (edit, userId) => onSend(edit, userId, step.ratingKey, step.problem))
  }
}

const stepComponent: ComponentHandler = {
  customIdPrefix: REPORT_PREFIX,
  commandType: "PROBLEM_REPORT" as DiscordCommandType,
  handle: handleStep,
}

/** `/report title:`, and its steps' select menus and buttons. */
export const reportCommand: SlashCommand = {
  data: COMMAND_DEFINITIONS.report,
  commandType: "PROBLEM_REPORT" as DiscordCommandType,
  handle: handleReport,
  components: [stepComponent],
}
