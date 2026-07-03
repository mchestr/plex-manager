/**
 * Job id helpers.
 *
 * Kept free of any BullMQ/Redis imports so it can be unit-tested in isolation
 * without pulling in the (ESM) queue transport dependencies.
 */

/**
 * Sanitize a custom BullMQ job id.
 *
 * BullMQ uses `:` as its Redis key delimiter and rejects any custom job id that
 * contains one (unless it splits into exactly 3 segments — the legacy repeatable
 * job format). Our job-type constants are themselves colon-delimited (e.g.
 * `plex:access:grant`), so ids built by interpolating a job type would always be
 * rejected. Replace colons with `-` so ids stay valid while preserving dedupe
 * semantics: the same input always maps to the same sanitized id.
 */
export function sanitizeJobId(jobId: string): string {
  return jobId.replace(/:/g, "-")
}
