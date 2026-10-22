/**
 * Every TanStack Query key in the app, in one place (P10.7, UI-41), so a
 * mutation invalidates exactly the key its reader uses.
 *
 * First data arrives as Server Component props; a query only covers what the
 * client drives afterwards (polling, typeahead, a refetch after a mutation),
 * seeded with `initialData` where the page already has it.
 */
export const queryKeys = {
  adminSearch: (kind: string, q: string) => ["admin-search", kind, q] as const,
  removeMemberPreview: (userId: string) => ["remove-member-preview", userId] as const,
  rewindDryRun: (runId: string | null) => ["rewind-dry-run", runId] as const,
  rewindSeasonStatus: (year: number) => ["rewind-season-status", year] as const,
  rewindStatus: (year: number | null, userId: string | null) => ["rewind-status", year, userId] as const,
  subscriptionProvisioning: () => ["subscription-provisioning"] as const,
  userActivityTimeline: (userId: string) => ["user-activity-timeline", userId] as const,
  watchlistSync: () => ["watchlist-sync"] as const,
}
