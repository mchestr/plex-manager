/**
 * Barrel codemod (plan step P11.5, DUP-16): moves every import of the deleted
 * action barrels, `@/actions/admin` and `@/actions/users`, to the module that
 * defines each name, so the barrels can go and `no-restricted-imports` can
 * ban them.
 *
 * ## Rewrites
 *
 * | Form | Rewrite |
 * |---|---|
 * | `import { a, type B } from "@/actions/admin"` | one import per defining module, `type` kept |
 * | `jest.mock("@/actions/admin", () => ({ a: jest.fn() }))` | one `jest.mock` per defining module |
 *
 * Anything else (a namespace import, a mock factory that is not an object
 * literal, a name the map does not know) is listed for a hand edit and left
 * alone. A second run is a no-op.
 *
 * ## CLI
 *
 * ```sh
 * npx tsx --tsconfig tsconfig.scripts.json scripts/codemods/barrel-imports.ts [--write] [paths...]
 * ```
 *
 * A dry run over `app/`, `components/`, `hooks/`, `lib/`, `actions/` and
 * `__tests__/` by default.
 *
 * @module
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import ts from 'typescript'

/** Where each name the barrels re-exported is defined now. */
export const BARREL_TARGETS: Record<string, Record<string, string>> = {
  '@/actions/admin': {
    setLLMDisabled: '@/actions/admin/admin-config',
    updateLlmCaps: '@/actions/admin/admin-config',
    updateServerTimeZone: '@/actions/admin/admin-config',
    getWrappedSettings: '@/lib/wrapped/generation-settings',
    getLLMUsageRecords: '@/lib/data/llm-usage',
    getLLMUsageById: '@/lib/data/llm-usage',
    listLLMModels: '@/actions/admin/admin-llm-providers',
    updateChatLLMProvider: '@/actions/admin/admin-llm-providers',
    updateWrappedLLMProvider: '@/actions/admin/admin-llm-providers',
    updatePlexServer: '@/actions/admin/admin-servers',
    updateJellyfinServer: '@/actions/admin/admin-servers',
    updateTautulli: '@/actions/admin/admin-servers',
    updateOverseerr: '@/actions/admin/admin-servers',
    updateSonarr: '@/actions/admin/admin-servers',
    updateRadarr: '@/actions/admin/admin-servers',
    updateUserAdminStatus: '@/actions/admin/admin-users',
    setUserDisabled: '@/actions/admin/admin-users',
    getAdminSettings: '@/lib/data/admin-settings',
  },
  '@/actions/users': {
    getAllUsersWithWrapped: '@/lib/data/admin-users',
    getUserPlexWrapped: '@/actions/user-queries',
    unshareUserLibrary: '@/actions/user-queries',
  },
}

export interface BarrelReview {
  file: string
  line: number
  reason: string
}

export interface BarrelResult {
  output: string
  reviews: BarrelReview[]
}

interface Edit {
  start: number
  end: number
  text: string
}

const DEFAULT_PATHS = ['app', 'components', 'hooks', 'lib', 'actions', '__tests__']
const SOURCE = /\.(ts|tsx)$/

/** Groups `names` by defining module, in first-seen order; null when a name is unknown. */
function groupByTarget<T>(map: Record<string, string>, items: T[], nameOf: (item: T) => string): Map<string, T[]> | null {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const target = map[nameOf(item)]
    if (!target) return null
    groups.set(target, [...(groups.get(target) ?? []), item])
  }
  return groups
}

/** Rewrites one file's barrel imports and mocks. */
export function transformBarrelImports(path: string, source: string): BarrelResult {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
  const quote = source.includes("from '") ? "'" : '"'
  const edits: Edit[] = []
  const reviews: BarrelReview[] = []
  const review = (node: ts.Node, reason: string) =>
    reviews.push({ file: path, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, reason })

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const map = BARREL_TARGETS[node.moduleSpecifier.text]
      if (map) {
        const bindings = node.importClause?.namedBindings
        const typeOnly = node.importClause?.isTypeOnly ?? false
        if (!bindings || !ts.isNamedImports(bindings) || node.importClause?.name) {
          review(node, `a default or namespace import of ${node.moduleSpecifier.text}`)
        } else {
          const groups = groupByTarget(map, [...bindings.elements], (element) => (element.propertyName ?? element.name).text)
          if (!groups) review(node, `a name ${node.moduleSpecifier.text} does not map`)
          else {
            const text = [...groups]
              .map(([target, elements]) => {
                const names = elements.map((element) => element.getText(file)).join(', ')
                return `import ${typeOnly ? 'type ' : ''}{ ${names} } from ${quote}${target}${quote}`
              })
              .join('\n')
            edits.push({ start: node.getStart(file), end: node.getEnd(), text })
          }
        }
      }
    }

    if (
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      node.expression.expression.getText(file) === 'jest.mock'
    ) {
      const [specifier, factory] = node.expression.arguments
      const map = specifier && ts.isStringLiteral(specifier) ? BARREL_TARGETS[specifier.text] : undefined
      if (map && specifier && ts.isStringLiteral(specifier)) {
        const body = factory && ts.isArrowFunction(factory) ? factory.body : undefined
        const object = body && ts.isParenthesizedExpression(body) ? body.expression : body
        if (!object || !ts.isObjectLiteralExpression(object)) {
          review(node, `a jest.mock of ${specifier.text} whose factory is not an object literal`)
        } else {
          const properties = [...object.properties]
          const groups = groupByTarget(map, properties, (property) => property.name?.getText(file) ?? '')
          if (!groups) review(node, `a mocked name ${specifier.text} does not map`)
          else {
            const mockQuote = specifier.getText(file)[0]
            const text = [...groups]
              .map(([target, props]) => {
                const members = props.map((property) => property.getText(file)).join(', ')
                return `jest.mock(${mockQuote}${target}${mockQuote}, () => ({ ${members} }))`
              })
              .join('\n')
            edits.push({ start: node.getStart(file), end: node.getEnd(), text })
          }
        }
      }
    }

    ts.forEachChild(node, visit)
  }
  visit(file)

  let output = source
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end)
  }
  return { output, reviews }
}

function walk(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path).flatMap((name) =>
    name === 'node_modules' || name === '.next' || name === 'generated' ? [] : walk(join(path, name))
  )
}

/**
 * Runs the CLI; returns the exit code.
 *
 * @internal
 */
export function main(argv: string[], root = process.cwd(), log: (line: string) => void = console.log): number {
  const write = argv.includes('--write')
  const paths = argv.filter((arg) => !arg.startsWith('--'))
  const files = (paths.length > 0 ? paths : DEFAULT_PATHS)
    .flatMap((path) => walk(join(root, path)))
    .filter((path) => SOURCE.test(path))

  let changed = 0
  for (const absolute of files) {
    const path = relative(root, absolute)
    const source = readFileSync(absolute, 'utf8')
    const { output, reviews } = transformBarrelImports(path, source)
    for (const item of reviews) log(`review ${item.file}:${item.line}: ${item.reason}`)
    if (output === source) continue
    changed += 1
    log(`${write ? 'rewrote' : 'would rewrite'} ${path}`)
    if (write) writeFileSync(absolute, output)
  }
  log(`Barrel codemod: ${changed} file(s) ${write ? 'rewritten' : 'to rewrite'}`)
  return 0
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2))
}
