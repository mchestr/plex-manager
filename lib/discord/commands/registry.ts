/**
 * Slash-command registry.
 *
 * ## Overview
 *
 * Central catalogue of the bot's slash (`/`) commands. Introduced in Step 9 as
 * the infrastructure the interaction router dispatches against. Migrated/added:
 * `/help` (Step 10), `/mark` (Step 12), `/assistant` (Step 13), and the personal
 * self-service commands `/mymarks`, `/mystats`, `/watching` (Phase 4).
 *
 * Each command pairs the discord.js registration payload (`data`) with an audit
 * `commandType` and an async `handle` that receives a resolved
 * {@link InteractionContext}. Commands with an autocompleting option also expose
 * an `autocomplete` method the router routes `isAutocomplete()` interactions to.
 *
 * The `data` builders live in `definitions.ts` (P11.7), which registration
 * imports on its own. Each entry here imports its handler module lazily, so
 * importing the registry loads neither Prisma nor the handlers' dependencies.
 */

import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageComponentInteraction,
  SlashCommandBuilder,
} from "discord.js"
import type { VerifyDiscordUserResult } from "../services"
import type { DiscordCommandType } from "@/lib/generated/prisma"
import { MARK_SELECT_PREFIX, type CommandName } from "./definitions"

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


/** One registry entry: a command's name and its lazily imported handler module. */
interface CommandEntry {
  name: CommandName
  load: () => Promise<SlashCommand>
  /** The `customId` prefixes of the components the command owns. */
  componentPrefixes?: readonly string[]
}

/**
 * Every slash command, in registration order. Dispatch is keyed off `name`.
 *
 * @internal
 */
export const COMMANDS: readonly CommandEntry[] = [
  { name: "help", load: () => import("./help").then((m) => m.helpCommand) },
  {
    name: "mark",
    load: () => import("./mark").then((m) => m.markCommand),
    componentPrefixes: [MARK_SELECT_PREFIX],
  },
  { name: "assistant", load: () => import("./assistant").then((m) => m.assistantCommand) },
  { name: "mymarks", load: () => import("./mymarks").then((m) => m.myMarksCommand) },
  { name: "mystats", load: () => import("./mystats").then((m) => m.myStatsCommand) },
  { name: "watching", load: () => import("./watching").then((m) => m.watchingCommand) },
]

const ENTRY_BY_NAME: ReadonlyMap<string, CommandEntry> = new Map(COMMANDS.map((entry) => [entry.name, entry]))

/**
 * Look up a registered slash command by its (top-level) command name, loading
 * its handler module on first use.
 *
 * @param name - The `interaction.commandName` to resolve.
 * @returns The matching command, or `undefined` when none is registered.
 */
export async function getCommand(name: string): Promise<SlashCommand | undefined> {
  return ENTRY_BY_NAME.get(name)?.load()
}

/**
 * Resolve the {@link ComponentHandler} that owns a component `custom_id`.
 *
 * Matches the first handler whose {@link ComponentHandler.customIdPrefix} is a
 * prefix of `customId`. Component interactions carry no command name, so this
 * prefix match is how the router attributes a button / select-menu response back
 * to the command that created it. Only the owning command's module is loaded.
 *
 * @param customId - The interaction's `custom_id`.
 * @returns The owning handler, or `undefined` when none claims the prefix.
 */
export async function getComponentHandler(customId: string): Promise<ComponentHandler | undefined> {
  const entry = COMMANDS.find((candidate) =>
    candidate.componentPrefixes?.some((prefix) => customId.startsWith(prefix))
  )
  const command = await entry?.load()
  return command?.components?.find((handler) => customId.startsWith(handler.customIdPrefix))
}
