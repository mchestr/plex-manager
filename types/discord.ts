/** The Discord connection fields the home dashboard shows for a linked member. */
export interface DashboardDiscordConnection {
  username: string
  discriminator?: string | null
  globalName?: string | null
  linkedAt?: string | null
  metadataSyncedAt?: string | null
}
