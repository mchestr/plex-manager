/**
 * Shared "require an entitled user" guard for slash-command handlers.
 *
 * ## Overview
 *
 * Every self-service slash command (`/mystats`, `/mymarks`, `/watching`,
 * `/assistant`, `/mark`) begins with the same gate: the invoking Discord account
 * must be **linked** to a Plex-manager user AND that user must be an **entitled
 * member** (see `lib/access.ts` / `verifyDiscordUser`). Unentitled users must not
 * reach any command that touches server data — this prevents data disclosure to
 * non-subscribers.
 *
 * - **Not linked** → ephemeral nudge with the account-link portal URL.
 * - **Linked but not entitled** (Stripe gating on, no active subscription) →
 *   ephemeral nudge explaining a subscription is required, still including the
 *   link/portal URL so they can (re)connect and subscribe.
 * - **Linked + entitled** → returns the resolved user; no reply.
 *
 * When Stripe gating is disabled (the default) every linked user is entitled, so
 * this behaves exactly like the previous linked-only gate.
 *
 * Handlers call it as their first step:
 *
 * ```ts
 * const user = await requireLinkedUser(ctx)
 * if (!user) return
 * // ...user is the resolved, entitled verifiedUser.user
 * ```
 *
 * ## Reply mechanics
 *
 * The nudge is always ephemeral (`MessageFlags.Ephemeral`). If the interaction
 * has already been deferred or replied to (a command that defers before gating),
 * the helper uses `editReply`; otherwise `reply`. This keeps each command's
 * existing ordering intact.
 */

import { MessageFlags } from "discord.js"
import { getDiscordPortalUrl } from "@/lib/discord/config"
import type { VerifyDiscordUserResult } from "../services"
import type { InteractionContext } from "./registry"

/**
 * The resolved, linked Plex-manager user carried on a {@link VerifyDiscordUserResult}.
 * Non-optional here because {@link requireLinkedUser} only returns it when present.
 */
export type LinkedUser = NonNullable<VerifyDiscordUserResult["user"]>

/** Build the "please link your account" nudge for an unlinked user. */
export function buildNotLinkedMessage(action?: string): string {
  const tail = action ? ` before ${action}` : ""
  return `You need to link your account${tail}. Link it here: ${getDiscordPortalUrl()}`
}

/** Build the "subscription required" nudge for a linked-but-unentitled user. */
export function buildNotEntitledMessage(): string {
  return `Your account is linked but doesn't have an active membership, so bot commands are unavailable. Manage your account here: ${getDiscordPortalUrl()}`
}

/**
 * Ensure the invoking user is linked AND an entitled member.
 *
 * When entitled, returns the resolved user and sends no reply. Otherwise sends an
 * ephemeral nudge (link nudge when unlinked, subscription nudge when linked but
 * unentitled) and returns `null`.
 *
 * @param ctx - The resolved interaction context.
 * @param opts - Optional overrides; `action` customises the not-linked nudge
 *   (e.g. `"viewing your marks"`).
 * @returns The entitled user, or `null` when the gate rejects (a reply was sent).
 */
export async function requireLinkedUser(
  ctx: InteractionContext,
  opts?: { action?: string }
): Promise<LinkedUser | null> {
  const { interaction, verifiedUser } = ctx

  if (verifiedUser.linked && verifiedUser.entitled && verifiedUser.user) {
    return verifiedUser.user
  }

  const content =
    verifiedUser.linked && !verifiedUser.entitled
      ? buildNotEntitledMessage()
      : buildNotLinkedMessage(opts?.action)

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content })
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral })
  }

  return null
}
