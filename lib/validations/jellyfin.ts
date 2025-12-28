import { z } from "zod"

import { createPublicUrlSchema, createServerUrlSchema } from "./shared-schemas"

export const jellyfinServerSchema = z.object({
  name: z.string().min(1, "Server name is required"),
  url: createServerUrlSchema("8096"),
  apiKey: z.string().min(1, "API key is required"),
  publicUrl: createPublicUrlSchema("jellyfin.example.com"),
})

export type JellyfinServerInput = z.input<typeof jellyfinServerSchema>
export type JellyfinServerParsed = z.output<typeof jellyfinServerSchema>

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
export interface JellyfinUserPolicy {
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
 * Jellyfin authentication result from /Users/AuthenticateByName endpoint
 */
export interface JellyfinAuthResult {
  /** User info */
  User: JellyfinUser
  /** Session info */
  SessionInfo?: {
    /** Session ID */
    Id: string
    /** User ID */
    UserId: string
    /** User name */
    UserName: string
  }
  /** Access token for this session */
  AccessToken: string
  /** Server ID */
  ServerId: string
}

/**
 * Request body for creating a new Jellyfin user
 */
export interface JellyfinCreateUserRequest {
  /** Username for the new user */
  Name: string
  /** Password for the new user */
  Password?: string
}

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
