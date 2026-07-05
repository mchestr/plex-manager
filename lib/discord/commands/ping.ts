/**
 * Temporary `/ping` demo command.
 *
 * Introduced in Step 9 purely to prove the slash-command registry → interaction
 * router → audit wrapper pipeline works end-to-end. It has no dependencies on
 * linked accounts and simply replies "pong" ephemerally. Real commands replace
 * it in later steps; this can be removed once the migration is complete.
 */

import { MessageFlags, SlashCommandBuilder } from "discord.js"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import type { InteractionContext, SlashCommand } from "./registry"

export const pingCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check that the bot is responsive"),
  commandType: "HELP" as DiscordCommandType,
  async handle(ctx: InteractionContext): Promise<void> {
    await ctx.interaction.reply({
      content: "pong",
      flags: MessageFlags.Ephemeral,
    })
  },
}
