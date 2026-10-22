/**
 * Compares per-file design-debt counts with the committed baseline
 * (`design-debt.json`, plan step P1.8). Counts may only fall, and a file the
 * baseline does not know must count zero.
 *
 * A file's baseline entry is found under its own path, or else under the path
 * it was renamed from (`renames` holds `[from, to]` pairs from git), so a rename
 * carries its counts over. Baseline files that are gone, and not renamed, are
 * deleted: never a failure, and `update` drops them.
 *
 * Pure functions with no `import.meta`, so Jest's SWC transform can load it.
 */

export function sortKeys(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * @param baseline - `{ [path]: { [rule]: n } }` from `design-debt.json`
 * @param current - every scanned file, with `{}` for a file that counts zero
 * @param renames - `[from, to]` path pairs
 * @returns `{ ok, rises, added, drops, deleted }`; `ok` is false on any rise or
 *   added file with a non-zero count
 *
 * @example
 * ```js
 * compare({ 'a.tsx': { gradient: 2 } }, { 'b.tsx': { gradient: 1 } }, [['a.tsx', 'b.tsx']])
 * // { ok: true, rises: [], added: [], deleted: [],
 * //   drops: [{ file: 'b.tsx', from: 'a.tsx', rule: 'gradient', was: 2, now: 1 }] }
 * ```
 */
export function compare(baseline, current, renames = []) {
  const renamedFrom = new Map(renames.map(([from, to]) => [to, from]))
  const consumed = new Set()
  const rises = []
  const added = []
  const drops = []

  for (const file of Object.keys(current).sort()) {
    const counts = current[file]
    const from = file in baseline ? file : renamedFrom.get(file)
    if (from === undefined || !(from in baseline)) {
      if (Object.values(counts).some((n) => n > 0)) added.push({ file, counts })
      continue
    }
    consumed.add(from)
    const base = baseline[from]
    for (const rule of Object.keys({ ...base, ...counts }).sort()) {
      const was = base[rule] ?? 0
      const now = counts[rule] ?? 0
      const entry = { file, ...(from !== file ? { from } : {}), rule, was, now }
      if (now > was) rises.push(entry)
      else if (now < was) drops.push(entry)
    }
  }

  const deleted = Object.keys(baseline)
    .filter((file) => !(file in current) && !consumed.has(file))
    .sort()
  return { ok: rises.length === 0 && added.length === 0, rises, added, drops, deleted }
}

/**
 * The lowered baseline: current counts for every known file, renames under
 * their new path, deleted and zero-count files dropped. Refuses (`ok: false`,
 * no `files`) when any count would rise or a new file would be added.
 */
export function update(baseline, current, renames = []) {
  const result = compare(baseline, current, renames)
  if (!result.ok) return { ok: false, result }
  return { ok: true, result, files: nonZero(current) }
}

/**
 * `design:update --add-rule <id>`: records the current counts of rules the
 * baseline has never seen, so a new rule can join the ratchet while every
 * other rule still only falls. Seeds `baseline` with those counts (under the
 * path a renamed file came from) and then runs `update`. Refuses (`ok: false`,
 * `known` lists them) a rule the baseline already counts.
 */
export function addRules(baseline, current, rules, renames = []) {
  const counted = totals(baseline)
  const known = rules.filter((rule) => rule in counted)
  if (known.length > 0) return { ok: false, known }
  const renamedFrom = new Map(renames.map(([from, to]) => [to, from]))
  const seeded = Object.fromEntries(Object.entries(baseline).map(([file, counts]) => [file, { ...counts }]))
  for (const [file, counts] of Object.entries(current)) {
    for (const rule of rules) {
      if (!counts[rule]) continue
      const from = !(file in seeded) && seeded[renamedFrom.get(file)] ? renamedFrom.get(file) : file
      seeded[from] = { ...seeded[from], [rule]: counts[rule] }
    }
  }
  return update(seeded, current, renames)
}

/** The non-zero entries of `current`, sorted: a fresh baseline. */
export function nonZero(current) {
  return sortKeys(
    Object.fromEntries(Object.entries(current).filter(([, counts]) => Object.keys(counts).length > 0))
  )
}

/** Per-rule totals across files, keys sorted. */
export function totals(files) {
  const sums = {}
  for (const counts of Object.values(files)) {
    for (const [rule, n] of Object.entries(counts)) sums[rule] = (sums[rule] ?? 0) + n
  }
  return sortKeys(sums)
}
