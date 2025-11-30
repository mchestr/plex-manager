/**
 * Standard result type for connection module operations
 *
 * This type provides a consistent pattern for handling success/failure
 * across all connection modules (Plex, Tautulli, Sonarr, Radarr, etc.)
 *
 * Benefits:
 * - Forces explicit error handling at call sites
 * - No try-catch needed by consumers
 * - Type-safe error handling with discriminated union
 */

/**
 * Successful connection result with data
 */
export type ConnectionSuccess<T> = {
  success: true
  data: T
}

/**
 * Failed connection result with error message
 */
export type ConnectionError = {
  success: false
  error: string
}

/**
 * Union type for connection results
 * Discriminated union on `success` property for type narrowing
 */
export type ConnectionResult<T> = ConnectionSuccess<T> | ConnectionError
