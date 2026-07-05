/**
 * Shared "require a linked user" guard for slash-command handlers.
 *
 * ## Overview
 *
 * Every self-service slash command (`/mystats`, `/mymarks`, `/watching`,
 * `/assistant`, `/mark`) begins with the same gate: if the invoking Discord
 * account is not linked to a Plex-manager user, reply ephemerally with a
 * "link your account" nudge and stop. This helper collapses that repeated block
 * into one place.
 *
 * Handlers call it as their first step:
 *
 * ```ts
 * const user = await requireLinkedUser(ctx)
 * if (!user) return
 * // ...user is the resolved verifiedUser.user
 * ```
 *
 * ## Reply mechanics
 *
 * The nudge is always ephemeral (`MessageFlags.Ephemeral`). If the interaction
 * has already been deferred or replied to (e.g. a command that defers before
 * gating), the helper uses `editReply`; otherwise it uses `reply`. This keeps
 * each command's existing ordering intact — the helper adapts to whatever state
 * the interaction is in.
 */

import { MessageFlags } from "discord.js"
import type { VerifyDiscordUserResult } from "../services"
import type { InteractionContext } from "./registry"

/**
 * The resolved, linked Plex-manager user carried on a {@link VerifyDiscordUserResult}.
 * Non-optional here because {@link requireLinkedUser} only returns it when present.
 */
export type LinkedUser = NonNullable<VerifyDiscordUserResult["user"]>

/** Default nudge shown when the invoking Discord account is not linked. */
export const DEFAULT_LINK_NUDGE =
  "You need to link your account before using this. Use the link provided earlier."

/**
 * Ensure the invoking user is linked to a Plex-manager account.
 *
 * When linked, returns the resolved user and sends no reply. When not linked,
 * sends an ephemeral nudge (via `editReply` if the interaction is already
 * deferred/replied, otherwise `reply`) and returns `null`.
 *
 * @param ctx - The resolved interaction context.
 * @param opts - Optional overrides; `message` customises the nudge copy.
 * @returns The linked user, or `null` when unlinked (a reply was sent).
 */
export async function requireLinkedUser(
  ctx: InteractionContext,
  opts?: { message?: string }
): Promise<LinkedUser | null> {
  const { interaction, verifiedUser } = ctx

  if (verifiedUser.linked && verifiedUser.user) {
    return verifiedUser.user
  }

  const content = opts?.message ?? DEFAULT_LINK_NUDGE

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content })
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral })
  }

  return null
}
