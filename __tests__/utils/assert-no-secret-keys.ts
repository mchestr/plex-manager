/**
 * Fails when any key in a value looks like a secret.
 *
 * Walks plain objects and arrays at any depth and collects the path of every
 * key matching `/token|apikey|secret|password|serialkey/i`. Use it on server-action
 * results and client-component props or state to prove that no credential
 * reaches the browser (SEC-18, BP-03).
 *
 * `shareToken` (the public share-link slug) and `nextToken` (a pagination
 * cursor) are not secrets and are allowed.
 *
 * @example
 * ```ts
 * assertNoSecretKeys({ usages: [{ user: { name: 'Ann' } }] }) // passes
 * assertNoSecretKeys({ usages: [{ user: { plexAuthToken: 'x' } }] })
 * // throws: Secret-looking keys found: $.usages[0].user.plexAuthToken
 * ```
 */

const SECRET_KEY_PATTERN = /token|apikey|secret|password|serialkey/i
const ALLOWED_KEYS = new Set(['shareToken', 'nextToken'])

/** Returns the path of every secret-looking key in `value`. */
export function findSecretKeys(value: unknown): string[] {
  const found: string[] = []
  const seen = new WeakSet<object>()

  function walk(node: unknown, path: string): void {
    if (node === null || typeof node !== 'object') return
    if (seen.has(node)) return
    seen.add(node)

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`))
      return
    }

    for (const [key, child] of Object.entries(node)) {
      const childPath = `${path}.${key}`
      if (SECRET_KEY_PATTERN.test(key) && !ALLOWED_KEYS.has(key)) {
        found.push(childPath)
      }
      walk(child, childPath)
    }
  }

  walk(value, '$')
  return found
}

/** Throws, listing every offending path, when `value` holds a secret-looking key. */
export function assertNoSecretKeys(value: unknown): void {
  const found = findSecretKeys(value)
  if (found.length > 0) {
    throw new Error(`Secret-looking keys found: ${found.join(', ')}`)
  }
}
