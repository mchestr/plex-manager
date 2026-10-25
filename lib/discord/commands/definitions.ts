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
  .setDescription("Show available commands and how to use them")
  .addStringOption((option) =>
    option
      .setName("command")
      .setDescription("Get detailed help for a specific command")
      .setAutocomplete(true)
  ) as SlashCommandBuilder

const markSubcommands: [name: string, description: string][] = [
  ["finished", "Mark as finished watching (marks it watched on your Plex account)"],
  ["keep", "Mark as keep forever (protected from auto-deletion)"],
  ["notinterested", "Mark as not interested (won't be recommended)"],
  ["rewatch", "Mark as a rewatch candidate"],
  ["badquality", "Report media as poor quality (may be re-downloaded)"],
]

const mark = markSubcommands.reduce(
  (builder, [name, description]) =>
    builder.addSubcommand((sub) =>
      sub
        .setName(name)
        .setDescription(description)
        .addStringOption((option) => option.setName("title").setDescription("Title to search for").setRequired(true))
    ) as SlashCommandBuilder,
  new SlashCommandBuilder().setName("mark").setDescription("Mark a movie or show in your Plex library")
)

const assistant = new SlashCommandBuilder()
  .setName("assistant")
  .setDescription("Ask the AI assistant a question")
  .addSubcommand((sub) =>
    sub
      .setName("ask")
      .setDescription("Ask a question. Only you see the answer; server admins can review assistant chats")
      .addStringOption((option) =>
        option.setName("prompt").setDescription("What would you like to ask?").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("reset").setDescription("Clear your assistant conversation context")
  ) as SlashCommandBuilder

const mymarks = new SlashCommandBuilder()
  .setName("mymarks")
  .setDescription("Show the media you've marked")
  .addStringOption((option) =>
    option
      .setName("type")
      .setDescription("Only show marks of this type")
      .setRequired(false)
      .addChoices(...MARK_TYPE_CHOICES)
  ) as SlashCommandBuilder

const mystats = new SlashCommandBuilder()
  .setName("mystats")
  .setDescription("See your own Plex watch stats for this year (only visible to you)")

const watching = new SlashCommandBuilder()
  .setName("watching")
  .setDescription("See what you're currently watching")

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
