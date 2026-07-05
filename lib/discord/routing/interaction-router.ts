/**
 * Discord interaction router.
 *
 * ## Overview
 *
 * Single entry point for the discord.js `InteractionCreate` event. It type-guards
 * the incoming interaction and dispatches slash commands (`ChatInputCommand`) to
 * the registered {@link SlashCommand} handler, wrapping each in the audit
 * lifecycle ({@link withAuditLog}).
 *
 * Runs side by side with the legacy `MessageCreate` / `!`-prefix handler in
 * `bot.ts` — this router only handles Discord *interactions* (slash commands and,
 * later, message components).
 *
 * ## Dependency injection
 *
 * `verifyDiscordUser` and the command lookup are injected via {@link RouteDeps}
 * so the router is unit-testable without a live gateway client or database.
 * Defaults wire up the real implementations.
 *
 * ## Autocomplete
 *
 * `isAutocomplete()` interactions are dispatched to the matching command's
 * optional `autocomplete` method. These are option-suggestion callbacks (not
 * command invocations), so they are not audit-logged and never verify the user.
 *
 * ## Component routing (Step 12)
 *
 * Button / select-menu interactions are attributed to the {@link ComponentHandler}
 * whose `customIdPrefix` matches the interaction's `custom_id` (components carry
 * no command name). The matched handler is dispatched through {@link withAuditLog}
 * under its own `commandType` (e.g. `SELECTION` for `/mark`'s disambiguation
 * menu). Unknown components are acknowledged with an ephemeral notice.
 */

import {
  MessageFlags,
  type Interaction,
  type AutocompleteInteraction,
  type ButtonInteraction,
  type MessageComponentInteraction,
  type StringSelectMenuInteraction,
} from "discord.js"
import {
  getCommand as defaultGetCommand,
  getComponentHandler as defaultGetComponentHandler,
  type ComponentHandler,
  type SlashCommand,
} from "../commands/registry"
import { verifyDiscordUser as defaultVerifyDiscordUser } from "../services"
import { withAuditLog } from "./audit-wrapper"
import type { CreateCommandLogParams } from "../audit"

/**
 * Injectable dependencies for {@link routeInteraction}.
 */
export interface RouteDeps {
  /** Resolve the linked-user status for a Discord user id. */
  verifyDiscordUser: typeof defaultVerifyDiscordUser
  /** Look up a registered slash command by name. */
  getCommand: (name: string) => SlashCommand | undefined
  /** Resolve the component handler owning a `custom_id`. */
  getComponentHandler: (customId: string) => ComponentHandler | undefined
}

const defaultDeps: RouteDeps = {
  verifyDiscordUser: defaultVerifyDiscordUser,
  getCommand: defaultGetCommand,
  getComponentHandler: defaultGetComponentHandler,
}

/**
 * Route a single Discord interaction to its handler.
 *
 * @param interaction - The interaction from the `InteractionCreate` event.
 * @param deps - Injectable collaborators; defaults to the real implementations.
 */
export async function routeInteraction(
  interaction: Interaction,
  deps: RouteDeps = defaultDeps
): Promise<void> {
  if (interaction.isChatInputCommand()) {
    await routeChatInputCommand(interaction, deps)
    return
  }

  if (interaction.isAutocomplete()) {
    await routeAutocomplete(interaction, deps)
    return
  }

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await routeComponent(interaction, deps)
    return
  }
}

/**
 * @internal Dispatch an autocomplete interaction to the matching command's
 * optional `autocomplete` handler. Silently ignored when no command matches or
 * the command declares no autocomplete handler.
 */
async function routeAutocomplete(
  interaction: AutocompleteInteraction,
  deps: RouteDeps
): Promise<void> {
  const command = deps.getCommand(interaction.commandName)
  if (!command?.autocomplete) return
  await command.autocomplete(interaction)
}

/**
 * @internal Dispatch a slash command through the audit wrapper.
 */
async function routeChatInputCommand(
  interaction: import("discord.js").ChatInputCommandInteraction,
  deps: RouteDeps
): Promise<void> {
  const command = deps.getCommand(interaction.commandName)

  if (!command) {
    await interaction.reply({
      content: `Unknown command: \`/${interaction.commandName}\`.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const verifiedUser = await deps.verifyDiscordUser(interaction.user.id)

  const auditParams: CreateCommandLogParams = {
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.tag,
    userId: verifiedUser.user?.id,
    commandType: command.commandType,
    commandName: interaction.commandName,
    channelId: interaction.channelId,
    channelType: interaction.guildId ? "guild" : "dm",
    guildId: interaction.guildId ?? undefined,
  }

  try {
    await withAuditLog(auditParams, () =>
      command.handle({
        interaction,
        verifiedUser,
        discordUserId: interaction.user.id,
        channelId: interaction.channelId,
      })
    )
  } catch {
    // The audit wrapper has already recorded a FAILED log. Surface a generic,
    // user-facing error without leaking internals. Guard against double-reply.
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Sorry, something went wrong running that command. Please try again in a moment.",
        flags: MessageFlags.Ephemeral,
      })
    } else {
      await interaction.followUp({
        content: "Sorry, something went wrong running that command. Please try again in a moment.",
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}

/**
 * @internal Route a button / select-menu interaction to its owning
 * {@link ComponentHandler}, matched by `custom_id` prefix, through the audit
 * lifecycle. Unknown components (no handler claims the prefix) get an ephemeral
 * notice; handler failures surface the same generic ephemeral error as slash
 * commands, guarding against a double reply.
 */
async function routeComponent(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  deps: RouteDeps
): Promise<void> {
  const handler = deps.getComponentHandler(interaction.customId)

  if (!handler) {
    await interaction.reply({
      content: "This control has expired or is no longer available.",
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const verifiedUser = await deps.verifyDiscordUser(interaction.user.id)

  const auditParams: CreateCommandLogParams = {
    discordUserId: interaction.user.id,
    discordUsername: interaction.user.tag,
    userId: verifiedUser.user?.id,
    commandType: handler.commandType,
    commandName: interaction.customId,
    channelId: interaction.channelId,
    channelType: interaction.guildId ? "guild" : "dm",
    guildId: interaction.guildId ?? undefined,
  }

  try {
    await withAuditLog(auditParams, () =>
      handler.handle(interaction as MessageComponentInteraction)
    )
  } catch {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Sorry, something went wrong handling that action. Please try again in a moment.",
        flags: MessageFlags.Ephemeral,
      })
    } else {
      await interaction.followUp({
        content: "Sorry, something went wrong handling that action. Please try again in a moment.",
        flags: MessageFlags.Ephemeral,
      })
    }
  }
}
