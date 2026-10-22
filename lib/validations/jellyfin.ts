import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const jellyfinServerSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("8096"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: createPublicUrlSchema("jellyfin.example.com"),
})

export type JellyfinServerParsed = z.output<typeof jellyfinServerSchema>

/**
 * Username and password chosen when redeeming a Jellyfin invite.
 *
 * The username allows no `@` and no spaces, so an invite can never create a
 * Jellyfin account named like an email address.
 */
export const jellyfinInviteCredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(
      /^[A-Za-z0-9._-]{3,32}$/,
      "Username must be 3 to 32 characters: letters, numbers, dots, dashes or underscores"
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(256, "Password must be at most 256 characters"),
})

/**
 * The invite page's account form (P10.7): the credentials with the password
 * typed twice, and the invite code from a hidden field. The action checks the
 * code itself.
 */
export const jellyfinInviteFormSchema = jellyfinInviteCredentialsSchema
  .extend({ code: z.string(), confirmPassword: z.string() })
  .refine((form) => form.password === form.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })

/**
 * Jellyfin API response types
 * Based on Jellyfin API documentation
 */

/**
 * Jellyfin server system info from /System/Info endpoint
 */
export interface JellyfinSystemInfo {
  /** Server name */
  ServerName: string
  /** Server ID (unique identifier) */
  Id: string
  /** Server version */
  Version: string
  /** Product name (e.g., "Jellyfin Server") */
  ProductName?: string
  /** Operating system */
  OperatingSystem?: string
  /** Local network address */
  LocalAddress?: string
  /** External address if configured */
  WanAddress?: string
  /** Whether startup wizard has been completed */
  StartupWizardCompleted?: boolean
}

/**
 * Jellyfin library (virtual folder) from /Library/VirtualFolders endpoint
 */
export interface JellyfinLibrary {
  /** Library name */
  Name: string
  /** Collection type: movies, tvshows, music, etc. */
  CollectionType?: string
  /** Library item ID */
  ItemId: string
  /** Locations (paths) for this library */
  Locations: string[]
  /** Primary image tag for thumbnail */
  PrimaryImageItemId?: string
  /** Refresh status */
  RefreshStatus?: string
}

/**
 * Jellyfin user from /Users endpoint
 */
export interface JellyfinUser {
  /** User ID (GUID) */
  Id: string
  /** Username */
  Name: string
  /** Server ID this user belongs to */
  ServerId?: string
  /** Whether user has password */
  HasPassword: boolean
  /** Whether user has configured password */
  HasConfiguredPassword: boolean
  /** Whether user has configured easy password (PIN) */
  HasConfiguredEasyPassword?: boolean
  /** Last login date */
  LastLoginDate?: string
  /** Last activity date */
  LastActivityDate?: string
  /** User policy (permissions) */
  Policy?: JellyfinUserPolicy
  /** Primary image tag (avatar) */
  PrimaryImageTag?: string
}

/**
 * Jellyfin user policy (permissions)
 */
interface JellyfinUserPolicy {
  /** Whether user is administrator */
  IsAdministrator: boolean
  /** Whether user is hidden from other users */
  IsHidden?: boolean
  /** Whether user is disabled */
  IsDisabled: boolean
  /** Max parental rating */
  MaxParentalRating?: number
  /** Blocked tags */
  BlockedTags?: string[]
  /** Enabled folders (library IDs user can access) */
  EnabledFolders?: string[]
  /** Whether all folders are enabled */
  EnableAllFolders?: boolean
  /** Whether user can play audio content */
  EnableAudioPlaybackTranscoding?: boolean
  /** Whether user can play video content */
  EnableVideoPlaybackTranscoding?: boolean
  /** Whether user can play remotely */
  EnableRemoteAccess?: boolean
  /** Whether user can download */
  EnableContentDownloading?: boolean
  /** Whether user can delete */
  EnableContentDeletion?: boolean
  /** Whether user can manage collections */
  EnableCollectionManagement?: boolean
  /** Whether user can sync */
  EnableSyncTranscoding?: boolean
  /** Invalid login attempt count */
  InvalidLoginAttemptCount?: number
  /** Whether remote control of other users is allowed */
  EnableRemoteControlOfOtherUsers?: boolean
  /** Whether shared device control is allowed */
  EnableSharedDeviceControl?: boolean
  /** Simultaneous stream limit */
  SimultaneousStreamLimit?: number
}

/**
 * The fields the app reads from the `/Users/AuthenticateByName` response:
 * the session's access token (logged out straight away) and the user's ID
 * and name. Other fields are stripped.
 */
export const jellyfinAuthResultSchema = z.object({
  AccessToken: z.string().min(1),
  User: z.object({
    Id: z.string().min(1),
    Name: z.string(),
  }),
})

export type JellyfinAuthResult = z.infer<typeof jellyfinAuthResultSchema>

/**
 * Request body for updating user policy (permissions)
 */
export interface JellyfinUpdateUserPolicyRequest {
  /** Whether user is administrator */
  IsAdministrator?: boolean
  /** Whether user is disabled */
  IsDisabled?: boolean
  /** Whether all folders are enabled */
  EnableAllFolders?: boolean
  /** Enabled folders (library IDs user can access) */
  EnabledFolders?: string[]
  /** Whether user can play audio content */
  EnableAudioPlaybackTranscoding?: boolean
  /** Whether user can play video content */
  EnableVideoPlaybackTranscoding?: boolean
  /** Whether user can access remotely */
  EnableRemoteAccess?: boolean
  /** Whether user can download content */
  EnableContentDownloading?: boolean
}
