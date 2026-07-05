/**
 * Slash-command registry.
 *
 * ## Overview
 *
 * Central catalogue of the bot's slash (`/`) commands. Introduced in Step 9 as
 * the infrastructure the interaction router dispatches against; real commands
 * are migrated in later steps. For now it carries a single temporary `/ping`
 * command so the pipeline is demoable end-to-end.
 *
 * Each entry pairs the discord.js registration payload (`data`) with an audit
 * `commandType` and an async `handle` that receives a resolved
 * {@link InteractionContext}. The `data` builders are consumed at registration
 * time (Step 14); the router only needs `commandType` and `handle`.
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js"
import type { VerifyDiscordUserResult } from "../services"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { pingCommand } from "./ping"

/**
 * Context handed to a slash-command handler after the router has resolved the
 * invoking user. `verifiedUser` mirrors {@link VerifyDiscordUserResult}: it is
 * always present, but `verifiedUser.linked` is `false` (and `.user` undefined)
 * when the Discord account is not linked to a Plex account.
 */
export interface InteractionContext {
  /** The raw slash-command interaction, for replying / reading options. */
  interaction: ChatInputCommandInteraction
  /** Result of `verifyDiscordUser` for the invoking user (never null). */
  verifiedUser: VerifyDiscordUserResult
  /** The invoking Discord user's snowflake id. */
  discordUserId: string
  /** The channel the interaction was invoked in. */
  channelId: string
}

/**
 * A registered slash command.
 */
export interface SlashCommand {
  /** discord.js builder used to register the command (Step 14). */
  data: SlashCommandBuilder
  /** Audit command type recorded for each invocation. */
  commandType: DiscordCommandType
  /** Execute the command against a resolved interaction context. */
  handle(ctx: InteractionContext): Promise<void>
}

/**
 * All registered slash commands. Router dispatch is keyed off
 * `data.name` (see {@link getCommand}).
 */
export const COMMANDS: SlashCommand[] = [pingCommand]

const COMMAND_BY_NAME: ReadonlyMap<string, SlashCommand> = new Map(
  COMMANDS.map((command) => [command.data.name, command])
)

/**
 * Look up a registered slash command by its (top-level) command name.
 *
 * @param name - The `interaction.commandName` to resolve.
 * @returns The matching command, or `undefined` when none is registered.
 */
export function getCommand(name: string): SlashCommand | undefined {
  return COMMAND_BY_NAME.get(name)
}

export { SlashCommandBuilder }
