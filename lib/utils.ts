import { type ClassValue, clsx } from "clsx"
import { randomBytes } from "crypto"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate a secure random token for sharing wrapped content
 * Uses crypto.randomBytes for cryptographically secure randomness
 * Returns a URL-safe base64 string (32 bytes = 43 characters)
 */
export function generateShareToken(): string {
  // Generate 32 random bytes (256 bits) for strong security
  const bytes = randomBytes(32)
  // Convert to base64url (URL-safe base64)
  return bytes.toString("base64url")
}

/**
 * Parse a URL string into its components (protocol, hostname, port)
 * Supports URLs like: https://example.com:32400, http://192.168.1.100:8181
 *
 * @param url - Full URL string including protocol and port
 * @returns Object with protocol, hostname, and port
 * @throws Error if URL is invalid
 */
export function parseServerUrl(url: string): { protocol: "http" | "https"; hostname: string; port: number } {
  try {
    // Ensure URL has a protocol
    let urlToParse = url.trim()

    // Check if URL has a protocol
    const protocolMatch = urlToParse.match(/^([a-z]+):\/\//i)
    if (protocolMatch) {
      const protocol = protocolMatch[1].toLowerCase()
      // Only allow http and https protocols
      if (protocol !== "http" && protocol !== "https") {
        throw new Error("Protocol must be http or https")
      }
    } else {
      // Default to https if no protocol specified
      urlToParse = `https://${urlToParse}`
    }

    const parsed = new URL(urlToParse)

    // Validate protocol
    const protocol = parsed.protocol.replace(":", "").toLowerCase() as "http" | "https"
    if (protocol !== "http" && protocol !== "https") {
      throw new Error("Protocol must be http or https")
    }

    // Extract hostname
    const hostname = parsed.hostname
    if (!hostname) {
      throw new Error("Hostname is required")
    }

    // Extract port (default based on protocol if not specified)
    let port: number
    if (parsed.port) {
      port = parseInt(parsed.port, 10)
      if (isNaN(port) || port < 1 || port > 65535) {
        throw new Error("Port must be a number between 1 and 65535")
      }
    } else {
      // Default ports based on protocol
      port = protocol === "https" ? 443 : 80
    }

    return { protocol, hostname, port }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid URL format: ${error.message}. Expected format: https://example.com:32400`)
    }
    throw new Error(`Invalid URL format. Expected format: https://example.com:32400`)
  }
}

/**
 * Aggregate LLM usage records into a single summary
 *
 * @param usageRecords - Array of LLM usage records
 * @returns Aggregated LLM usage stats or null if no records
 */
export function aggregateLlmUsage(usageRecords: {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  provider: string | null;
  model: string | null;
}[]): {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  provider: string | null;
  model: string | null;
  count: number;
} | null {
  if (usageRecords.length === 0) {
    return null
  }

  return {
    totalTokens: usageRecords.reduce((sum, usage) => sum + usage.totalTokens, 0),
    promptTokens: usageRecords.reduce((sum, usage) => sum + usage.promptTokens, 0),
    completionTokens: usageRecords.reduce((sum, usage) => sum + usage.completionTokens, 0),
    cost: usageRecords.reduce((sum, usage) => sum + usage.cost, 0),
    provider: usageRecords[usageRecords.length - 1]?.provider || null,
    model: usageRecords[usageRecords.length - 1]?.model || null,
    count: usageRecords.length,
  }
}
