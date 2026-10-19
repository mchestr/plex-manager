/**
 * The production-dependency audit gate (plan step P1.5), as pure functions so
 * `scripts/__tests__/audit-gate.test.ts` can drive it with fixed reports.
 *
 * An advisory fails the gate when its severity is high or critical and no
 * exception in `.github/audit-exceptions.json` names it. An exception holds an
 * `id` (the GHSA id, or npm's numeric advisory id), a `reason`, and an
 * `expires` date (YYYY-MM-DD) at most 14 days after today. An exception that
 * has expired, or whose expiry is further out, fails the gate too.
 */

const MAX_EXCEPTION_DAYS = 14
const GATED = new Set(['high', 'critical'])
const DAY_MS = 24 * 60 * 60 * 1000

/** The GHSA id from an advisory URL, else npm's numeric id. */
function advisoryId(via) {
  const ghsa = typeof via.url === 'string' ? via.url.match(/GHSA(?:-[0-9a-z]{4}){3}/i) : null
  return ghsa ? ghsa[0] : String(via.source)
}

/**
 * The high and critical advisories in an `npm audit --json` (v2) report, one
 * per advisory id, with the packages it reaches.
 *
 * @internal
 */
export function gatedAdvisories(report) {
  const byId = new Map()
  for (const vulnerability of Object.values(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      // A string names another vulnerable package; its own entry lists the advisory.
      if (typeof via !== 'object' || !GATED.has(via.severity)) continue
      const id = advisoryId(via)
      const entry = byId.get(id) ?? { id, severity: via.severity, title: via.title, url: via.url, packages: [] }
      if (!entry.packages.includes(vulnerability.name)) entry.packages.push(vulnerability.name)
      byId.set(id, entry)
    }
  }
  return [...byId.values()]
}

/**
 * Problems with the exceptions file itself, as messages.
 *
 * @internal
 */
export function exceptionProblems(exceptions, now) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const problems = []
  for (const exception of exceptions) {
    const label = exception.id || '(no id)'
    if (!exception.id || !exception.reason) {
      problems.push(`Exception ${label} needs an id and a reason.`)
    }
    const expires = /^\d{4}-\d{2}-\d{2}$/.test(exception.expires ?? '') ? Date.parse(`${exception.expires}T00:00:00Z`) : NaN
    if (Number.isNaN(expires)) {
      problems.push(`Exception ${label} needs an expiry date as YYYY-MM-DD.`)
    } else if (expires < today) {
      problems.push(`Exception ${label} expired on ${exception.expires}; fix the advisory or renew the exception.`)
    } else if (expires > today + MAX_EXCEPTION_DAYS * DAY_MS) {
      problems.push(`Exception ${label} expires on ${exception.expires}, more than ${MAX_EXCEPTION_DAYS} days out.`)
    }
  }
  return problems
}

/**
 * Runs the gate. Returns the failure messages (empty when it passes) and the
 * gated advisories an exception covers.
 */
export function evaluateAudit(report, exceptions, now = new Date()) {
  const excepted = new Set(exceptions.map((exception) => exception.id))
  const advisories = gatedAdvisories(report)
  const failures = exceptionProblems(exceptions, now)
  for (const advisory of advisories) {
    if (excepted.has(advisory.id)) continue
    failures.push(
      `${advisory.severity} ${advisory.id} in ${advisory.packages.join(', ')}: ${advisory.title} (${advisory.url})`
    )
  }
  return { failures, excepted: advisories.filter((advisory) => excepted.has(advisory.id)) }
}
