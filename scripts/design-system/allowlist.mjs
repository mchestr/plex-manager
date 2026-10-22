/**
 * The documented exceptions to the design-system check (plan step P10.11,
 * ui-design-system 9.6). `check-design-system.mjs --strict` fails on any
 * count outside this list, so a new exception is reviewed in its PR.
 *
 * Each entry is `{ path, rules?, reason }`: `path` is a file, or a folder when
 * it ends in `/`; `rules` limits the entry to those rule ids (every rule when
 * absent); `reason` says why the count can't reach zero, and when it goes.
 *
 * Pure data and functions with no `import.meta`, so Jest can load it.
 */

/** @internal Exported for the reason check in its test. */
export const ALLOWLIST = [
  {
    path: 'components/setup/setup-wizard/',
    reason: 'The pre-refresh setup wizard; P10.25 rebuilds it on the primitives and tokens.',
  },
  {
    path: 'app/dev/rewind-stage/guess-island.tsx',
    rules: ['client-marker'],
    reason: "next/dynamic splits the answer island's chunk only from a client module.",
  },
  {
    path: 'app/dev/ui/_sections/command.tsx',
    rules: ['client-marker'],
    reason: "The command menu specimen composes cmdk's client parts with their shared context in one client tree.",
  },
  {
    path: 'components/admin/rewind/playground/facts-pane.tsx',
    rules: ['client-marker'],
    reason: 'Passes column cell renderers (functions) to DataTable, which the heuristic cannot see.',
  },
]

/**
 * True when `file` may count `rule` under `allowlist`.
 *
 * @internal
 */
export function isAllowed(file, rule, allowlist = ALLOWLIST) {
  return allowlist.some(
    (entry) =>
      (entry.path.endsWith('/') ? file.startsWith(entry.path) : file === entry.path) &&
      (entry.rules === undefined || entry.rules.includes(rule))
  )
}

/**
 * The counts `--strict` fails on: every non-zero count that no allowlist
 * entry covers.
 *
 * @param current - `{ [path]: { [rule]: n } }` from `countFile`
 * @returns `[{ file, rule, count }]`, sorted by file then rule
 *
 * @example
 * ```js
 * strictFailures({ 'components/admin/a.tsx': { 'raw-palette': 2 }, 'components/setup/setup-wizard/b.tsx': { blur: 1 } })
 * // [{ file: 'components/admin/a.tsx', rule: 'raw-palette', count: 2 }]
 * ```
 */
export function strictFailures(current, allowlist = ALLOWLIST) {
  const failures = []
  for (const file of Object.keys(current).sort()) {
    for (const [rule, count] of Object.entries(current[file]).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (count > 0 && !isAllowed(file, rule, allowlist)) failures.push({ file, rule, count })
    }
  }
  return failures
}

/** Allowlist entries that cover no current count, so they can go. */
export function staleEntries(current, allowlist = ALLOWLIST) {
  return allowlist.filter((entry) =>
    !Object.entries(current).some(([file, counts]) =>
      Object.entries(counts).some(([rule, n]) => n > 0 && isAllowed(file, rule, [entry]))
    )
  )
}
