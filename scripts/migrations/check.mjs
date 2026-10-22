/**
 * The migration naming check (plan step P11.6, BP-21), as a pure function so
 * `scripts/__tests__/check-migrations.test.ts` can drive it.
 *
 * Folders listed in `prisma/migrations/.legacy-names.json` predate the check
 * and are accepted as they are (`20251129215232_latest`, and the two merged
 * `20270115000000_*` folders that share a timestamp, among them). Every other
 * folder must:
 *
 * - match `^\d{14}_[a-z0-9]+(_[a-z0-9]+)+$`: a timestamp and at least two words;
 * - not consist only of deny-listed words (`latest`, `combined`, `changes`, ...);
 * - carry a real UTC timestamp, later than every legacy folder's and than the
 *   new folder before it, and not in the future (see FUTURE_GRACE_DAYS);
 * - hold a `migration.sql`.
 *
 * Round timestamps (`20270116000000`) are allowed: the schema-drift check
 * catches what matters.
 */

const NAME = /^(\d{14})_([a-z0-9]+(?:_[a-z0-9]+)+)$/

/** Words that say nothing about a migration on their own. */
const DENIED_WORDS = new Set(['latest', 'combined', 'changes', 'update', 'fix', 'migration', 'init'])

/**
 * How far ahead of the clock a timestamp may be. The 2026 plan dates its
 * migrations on the plan calendar (January to February 2027), which runs
 * ahead of the clock it was built on; the check is there to catch a mistyped
 * year, not a plan date.
 *
 * @internal
 */
export const FUTURE_GRACE_DAYS = 180

/** The UTC date a 14-digit Prisma timestamp names, or null when it names none. */
function parseTimestamp(stamp) {
  const [y, mo, d, h, mi, s] = [0, 4, 6, 8, 10, 12].map((at, i) => Number(stamp.slice(at, i === 0 ? 4 : at + 2)))
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
  const roundTrips =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s
  return roundTrips ? date : null
}

/**
 * Checks migration folder names.
 *
 * @param {object} input
 * @param {string[]} input.folders - every folder in `prisma/migrations`
 * @param {string[]} input.legacy - the folders in `.legacy-names.json`
 * @param {(folder: string) => boolean} input.hasSql - whether a folder holds `migration.sql`
 * @param {Date} input.now - the clock
 * @returns {string[]} one message per problem; empty when every folder passes
 */
export function checkMigrations({ folders, legacy, hasSql, now }) {
  const legacyNames = new Set(legacy)
  const problems = []
  const latestAllowed = now.getTime() + FUTURE_GRACE_DAYS * 24 * 60 * 60 * 1000
  let floor = legacy.reduce((max, folder) => (folder.slice(0, 14) > max ? folder.slice(0, 14) : max), '')
  let floorFolder = 'the newest legacy folder'

  for (const folder of [...folders].sort()) {
    if (!hasSql(folder)) problems.push(`${folder}: has no migration.sql`)
    if (legacyNames.has(folder)) continue

    const match = NAME.exec(folder)
    if (!match) {
      problems.push(`${folder}: name must be <14-digit timestamp>_<at least two lowercase words joined by _>`)
      continue
    }
    const [, stamp, name] = match
    if (name.split('_').every((word) => DENIED_WORDS.has(word))) {
      problems.push(`${folder}: "${name}" does not say what the migration does`)
    }
    const date = parseTimestamp(stamp)
    if (!date) {
      problems.push(`${folder}: ${stamp} is not a valid UTC timestamp`)
    } else if (date.getTime() > latestAllowed) {
      problems.push(`${folder}: ${stamp} is in the future`)
    }
    if (stamp <= floor) {
      problems.push(`${folder}: timestamp must be later than ${floorFolder} (${floor})`)
    } else {
      floor = stamp
      floorFolder = folder
    }
  }
  return problems
}
