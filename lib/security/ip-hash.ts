import { createHash } from "crypto"

import { clientIp } from "@/lib/security/client-ip"

/**
 * Hash IP address for privacy compliance
 * Uses SHA-256 with a salt to prevent rainbow table attacks
 * Uses NEXTAUTH_SECRET as the salt (already required for the app)
 */
export function hashIP(ip: string | null): string | null {
  if (!ip) {
    return null
  }

  // Use NEXTAUTH_SECRET as salt (already required, so no extra config needed)
  // Fallback to a default only in development/testing
  const salt = process.env.NEXTAUTH_SECRET ||
               (process.env.NODE_ENV === "development" ? "dev-salt-only" : null)

  if (!salt) {
    throw new Error("NEXTAUTH_SECRET is required for IP hashing")
  }

  // Hash the IP address with salt
  const hash = createHash("sha256")
    .update(ip + salt)
    .digest("hex")

  return hash
}

/**
 * Hashes the client address that {@link clientIp} finds behind
 * `TRUSTED_PROXY_HOPS` proxies, so a client cannot choose the stored value by
 * sending its own `X-Forwarded-For` entries.
 */
export function getHashedIP(request: Request): string | null {
  const ip = clientIp(request.headers)
  if (ip === "unknown") {
    return null
  }

  return hashIP(ip)
}

