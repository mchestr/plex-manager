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
  /**
   * Media cleanup (TS 10.7). `scope` is the rule id or "new"; `draftKey` is
   * `stableJson(draft)`; `view` joins tab, sort, page, search, near-miss chip and focus id.
   */
  cleanupPreview: (scope: string, draftKey: string, view: string) => ["cleanup-preview", scope, draftKey, view] as const,
  cleanupProtectionImpact: (draftKey: string) => ["cleanup-protection-impact", draftKey] as const,
  cleanupRecipePreview: (recipeId: string, level: string, valuesKey: string) =>
    ["cleanup-recipe-preview", recipeId, level, valuesKey] as const,
  cleanupWhy: (itemKey: string, scope: string, draftKey: string) => ["cleanup-why", itemKey, scope, draftKey] as const,
  conversationReview: (conversationId: string) => ["conversation-review", conversationId] as const,
  removeMemberPreview: (userId: string) => ["remove-member-preview", userId] as const,
  rewindDryRun: (runId: string | null) => ["rewind-dry-run", runId] as const,
  rewindSeasonStatus: (year: number) => ["rewind-season-status", year] as const,
  rewindStatus: (year: number | null, userId: string | null) => ["rewind-status", year, userId] as const,
  subscriptionProvisioning: () => ["subscription-provisioning"] as const,
  userActivityTimeline: (userId: string) => ["user-activity-timeline", userId] as const,
  watchlistSync: () => ["watchlist-sync"] as const,
}
