/**
 * Registers the bot's slash commands with Discord (GAP-13): one bulk
 * overwrite of the application's commands from {@link COMMAND_DEFINITIONS}.
 *
 * A guild id registers instantly in that guild (development); without one the
 * commands are global and can take up to an hour to appear. It imports only
 * the definitions, never Prisma, so the registration script runs without a
 * database when the token and client id are in the environment.
 */

import { REST, Routes } from "discord.js"
import { COMMAND_DEFINITIONS } from "@/lib/discord/commands/definitions"

export type RegisterSlashCommandsOptions =
  | { token: string; clientId: string; guildId?: string; dryRun?: false }
  /** Lists the commands without calling Discord, so it needs no credentials. */
  | { dryRun: true }

/**
 * Overwrites the application's (or the guild's) slash commands with the
 * current definitions, unless `dryRun` is set.
 *
 * @returns The command names, in registration order.
 */
export async function registerSlashCommands(options: RegisterSlashCommandsOptions): Promise<string[]> {
  const definitions = Object.values(COMMAND_DEFINITIONS)
  const names = definitions.map((definition) => definition.name)
  if (options.dryRun) return names

  const { token, clientId, guildId } = options
  const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId)
  await new REST().setToken(token).put(route, { body: definitions.map((definition) => definition.toJSON()) })
  return names
}
