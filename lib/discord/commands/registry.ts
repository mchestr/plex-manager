/**
 * Slash-command registry.
 *
 * ## Overview
 *
 * Central catalogue of the bot's slash (`/`) commands. Introduced in Step 9 as
 * the infrastructure the interaction router dispatches against; real commands
 * are migrated in later steps. `/help` (Step 10), `/mark` (Step 12), and
 * `/assistant` (Step 13) are migrated; more follow (`/mystats`, `/mymarks`,
 * `/watching`).
 *
 * Each entry pairs the discord.js registration payload (`data`) with an audit
 * `commandType` and an async `handle` that receives a resolved
 * {@link InteractionContext}. Commands with an autocompleting option also expose
 * an `autocomplete` method the router routes `isAutocomplete()` interactions to.
 * The `data` builders are consumed at registration time (Step 14); the router
 * only needs `commandType`, `handle`, and (optionally) `autocomplete`.
 */

import {
  SlashCommandBuilder,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
  type MessageComponentInteraction,
} from "discord.js"
import type { VerifyDiscordUserResult } from "../services"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { helpCommand } from "./help"
import { markCommand } from "./mark"
import { assistantCommand } from "./assistant"

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
 * A message-component (button / select-menu) handler owned by a slash command.
 *
 * The router matches an incoming component interaction to the first handler
 * whose {@link customIdPrefix} the interaction's `customId` starts with, wraps
 * the dispatch in the audit lifecycle under {@link commandType}, and invokes
 * {@link handle}. This lets a command (e.g. `/mark`) own the follow-up
 * interaction from a select menu it created earlier, keyed by `custom_id` prefix
 * rather than command name (components carry no command name).
 */
export interface ComponentHandler {
  /** `customId` prefix this handler claims (e.g. `"mark:select:"`). */
  customIdPrefix: string
  /** Audit command type recorded for each component interaction. */
  commandType: DiscordCommandType
  /** Handle the matched component interaction. */
  handle(interaction: MessageComponentInteraction): Promise<void>
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
  /**
   * Respond to an autocomplete interaction for one of this command's options.
   * Only present on commands that declare an autocompleting option. The router
   * dispatches `isAutocomplete()` interactions here; not audit-logged.
   */
  autocomplete?(interaction: AutocompleteInteraction): Promise<void>
  /**
   * Message-component handlers this command owns (button / select-menu). The
   * router routes component interactions to the matching handler by
   * `custom_id` prefix. Only present on commands that emit components.
   */
  components?: ComponentHandler[]
}

/**
 * All registered slash commands. Router dispatch is keyed off
 * `data.name` (see {@link getCommand}).
 */
export const COMMANDS: SlashCommand[] = [helpCommand, markCommand, assistantCommand]

const COMMAND_BY_NAME: ReadonlyMap<string, SlashCommand> = new Map(
  COMMANDS.map((command) => [command.data.name, command])
)

/**
 * Flattened list of every registered {@link ComponentHandler} across all
 * commands, in registration order. Consulted by {@link getComponentHandler}.
 */
const COMPONENT_HANDLERS: readonly ComponentHandler[] = COMMANDS.flatMap(
  (command) => command.components ?? []
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

/**
 * Resolve the {@link ComponentHandler} that owns a component `custom_id`.
 *
 * Matches the first handler whose {@link ComponentHandler.customIdPrefix} is a
 * prefix of `customId`. Component interactions carry no command name, so this
 * prefix match is how the router attributes a button / select-menu response back
 * to the command that created it.
 *
 * @param customId - The interaction's `custom_id`.
 * @returns The owning handler, or `undefined` when none claims the prefix.
 */
export function getComponentHandler(customId: string): ComponentHandler | undefined {
  return COMPONENT_HANDLERS.find((handler) => customId.startsWith(handler.customIdPrefix))
}

export { SlashCommandBuilder }
