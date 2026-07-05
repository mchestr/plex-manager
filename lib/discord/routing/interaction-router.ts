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
 * ## Component routing seam (Step 12)
 *
 * Button / select-menu interactions are recognised but not yet dispatched.
 * `routeComponent` is a clearly-marked stub that later steps fill in; today it
 * simply acknowledges nothing so unknown components fall through harmlessly.
 */

import {
  MessageFlags,
  type Interaction,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js"
import { getCommand as defaultGetCommand, type SlashCommand } from "../commands/registry"
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
}

const defaultDeps: RouteDeps = {
  verifyDiscordUser: defaultVerifyDiscordUser,
  getCommand: defaultGetCommand,
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

  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    await routeComponent(interaction)
    return
  }
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
 * @internal
 * TODO(Step 12): Route button / select-menu component interactions to their
 * handlers. This is intentionally a no-op stub for Step 9 — the slash-command
 * pipeline is the deliverable, and component handlers are migrated later. The
 * signature is kept narrow so the eventual implementation has a clear seam.
 */
async function routeComponent(
  _interaction: ButtonInteraction | StringSelectMenuInteraction
): Promise<void> {
  // No component handlers are registered yet. Later steps will look up a
  // component handler by customId here and dispatch through withAuditLog.
}
