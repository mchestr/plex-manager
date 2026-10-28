/**
 * The slash commands' registration payloads, and nothing else (GAP-13).
 *
 * `scripts/register-discord-commands.ts` imports this module, so it must never
 * load `@/lib/prisma` or a command handler: only `discord.js` builders and
 * type-only imports. `registry.ts` pairs each definition with its handler,
 * which it imports lazily.
 */

import { SlashCommandBuilder } from "discord.js"
import type { MarkType } from "@/lib/generated/prisma/client"

/** `custom_id` prefix for `/mark`'s disambiguation select menu. */
export const MARK_SELECT_PREFIX = "mark:select:"

/** `/mymarks type:` choices, in the embed's group order. */
export const MARK_TYPE_CHOICES: { name: string; value: MarkType }[] = [
  { name: "finished", value: "FINISHED_WATCHING" },
  { name: "keep", value: "KEEP_FOREVER" },
  { name: "notinterested", value: "NOT_INTERESTED" },
  { name: "rewatch", value: "REWATCH_CANDIDATE" },
  { name: "badquality", value: "POOR_QUALITY" },
]

const help = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show the commands and how to use them")
  .addStringOption((option) =>
    option
      .setName("command")
      .setDescription("Show help for one command")
      .setAutocomplete(true)
  ) as SlashCommandBuilder

const markSubcommands: [name: string, description: string][] = [
  ["finished", "Mark it as finished. Plex also marks it as watched on your account"],
  ["keep", "Mark it to keep forever. Automatic deletion does not remove it"],
  ["notinterested", "Mark it as not interesting to you. It is not recommended to you"],
  ["rewatch", "Mark it as a title to watch again"],
  ["badquality", "Report poor quality. The server may download it again"],
]

const mark = markSubcommands.reduce(
  (builder, [name, description]) =>
    builder.addSubcommand((sub) =>
      sub
        .setName(name)
        .setDescription(description)
        .addStringOption((option) => option.setName("title").setDescription("The title to find").setRequired(true))
    ) as SlashCommandBuilder,
  new SlashCommandBuilder().setName("mark").setDescription("Mark a movie or show in the Plex library")
)

const assistant = new SlashCommandBuilder()
  .setName("assistant")
  .setDescription("Ask the AI assistant a question")
  .addSubcommand((sub) =>
    sub
      .setName("ask")
      .setDescription("Ask a question. Only you see the answer. Server admins can read assistant conversations")
      .addStringOption((option) =>
        option.setName("prompt").setDescription("Your question").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("reset").setDescription("Clear your conversation with the assistant")
  ) as SlashCommandBuilder

const mymarks = new SlashCommandBuilder()
  .setName("mymarks")
  .setDescription("Show the titles you marked")
  .addStringOption((option) =>
    option
      .setName("type")
      .setDescription("Show only marks of this type")
      .setRequired(false)
      .addChoices(...MARK_TYPE_CHOICES)
  ) as SlashCommandBuilder

const mystats = new SlashCommandBuilder()
  .setName("mystats")
  .setDescription("Show your Plex watch stats for this year. Only you see them")

const watching = new SlashCommandBuilder()
  .setName("watching")
  .setDescription("Show your current Plex streams")

/** Every slash command's builder, by name, in registration order. */
export const COMMAND_DEFINITIONS = {
  help,
  mark,
  assistant,
  mymarks,
  mystats,
  watching,
} satisfies Record<string, SlashCommandBuilder>

export type CommandName = keyof typeof COMMAND_DEFINITIONS
