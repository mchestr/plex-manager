/**
 * The coverage ratchet (plan step P1.5), as pure functions so
 * `scripts/__tests__/coverage-ratchet.test.ts` can drive it.
 *
 * `jest.coverage-thresholds.json` is Jest's `coverageThreshold`: a `global`
 * floor and floors for paths (a file, or a directory ending in `/`). As in
 * Jest, a path's floor applies to its files together, and `global` covers
 * only the files no path names. Floors are whole percentages, rounded down.
 */

const METRICS = ['statements', 'branches', 'functions', 'lines']

/** Converts a summary's absolute file paths to `./`-relative ones. */
export function relativeSummary(summary, root) {
  const prefix = root.endsWith('/') ? root : `${root}/`
  return Object.fromEntries(
    Object.entries(summary)
      .filter(([file]) => file !== 'total')
      .map(([file, metrics]) => [file.startsWith(prefix) ? `./${file.slice(prefix.length)}` : file, metrics])
  )
}

function matches(key, file) {
  return key.endsWith('/') ? file.startsWith(key) : file === key
}

/** The percentage of each metric over `files`; 100 for a metric with nothing to cover. */
function percentages(files) {
  return Object.fromEntries(
    METRICS.map((metric) => {
      let total = 0
      let covered = 0
      for (const file of files) {
        total += file[metric].total
        covered += file[metric].covered
      }
      return [metric, total === 0 ? 100 : (covered / total) * 100]
    })
  )
}

/** Today's coverage for every key of `thresholds`, from a relative summary. */
export function measure(thresholds, files) {
  const paths = Object.keys(thresholds).filter((key) => key !== 'global')
  const entries = Object.entries(files)
  /** @type {Record<string, Record<string, number>>} */
  const result = {}
  for (const key of paths) {
    result[key] = percentages(entries.filter(([file]) => matches(key, file)).map(([, metrics]) => metrics))
  }
  if ('global' in thresholds) {
    result.global = percentages(
      entries.filter(([file]) => !paths.some((key) => matches(key, file))).map(([, metrics]) => metrics)
    )
  }
  return result
}

/** One message per floor that `measured` falls below. */
export function check(thresholds, measured) {
  const failures = []
  for (const [key, floors] of Object.entries(thresholds)) {
    for (const metric of METRICS) {
      const floor = floors[metric]
      if (floor === undefined) continue
      const value = measured[key][metric]
      if (value < floor) {
        failures.push(`${key} ${metric}: ${value.toFixed(2)}% is below the floor of ${floor}%`)
      }
    }
  }
  return failures
}

/** The thresholds with each floor raised to today's value rounded down; never lowered. */
export function raise(thresholds, measured) {
  return Object.fromEntries(
    Object.entries(thresholds).map(([key, floors]) => [
      key,
      Object.fromEntries(
        METRICS.map((metric) => [metric, Math.max(floors[metric] ?? 0, Math.floor(measured[key][metric]))])
      ),
    ])
  )
}
