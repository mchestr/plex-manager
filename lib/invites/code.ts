import "server-only"

import { randomInt } from "node:crypto"

const INVITE_CODE_LENGTH = 8
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // No 0, O, I, l or 1

/**
 * A random invite code from unambiguous characters, for admin and affiliate
 * invites. `crypto.randomInt`, because a code grants server access and must
 * not be predictable from earlier ones.
 */
export function generateInviteCode(): string {
  let result = ""
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    result += INVITE_CODE_CHARS.charAt(randomInt(INVITE_CODE_CHARS.length))
  }
  return result
}
