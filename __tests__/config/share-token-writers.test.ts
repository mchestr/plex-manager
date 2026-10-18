/**
 * @jest-environment node
 */

/**
 * Only one action may set `PlexWrapped.shareToken` (P0.19, SEC-16).
 *
 * Sharing is opt-in: `enableWrappedShareLink` mints the token when a member
 * asks for a link, and nothing else creates one. This test parses every
 * source file under `app`, `actions`, `lib` and `components` (tests and the
 * generated Prisma client excluded) and checks two things:
 *
 * 1. `generateShareToken` is mentioned only where it is defined
 *    (`lib/utils.ts`) and in `actions/wrapped-share-link.ts`, the only caller.
 * 2. A `shareToken` key in a Prisma write payload (`data`, or an upsert's
 *    `create` and `update`, followed through spreads, conditionals and
 *    same-file variables), an assignment to a `.shareToken` property, or a raw
 *    query naming the column appears only in `actions/wrapped-share-link.ts`
 *    and in P0.20's `lib/wrapped/maintenance/strip-rosters.ts`, which may only
 *    write `null`.
 *
 * P7.13 deletes `enableWrappedShareLink`; this test then asserts that no code
 * sets a non-null `shareToken` at all.
 */

import fs from 'fs'
import path from 'path'
import ts from 'typescript'

const ROOT = path.resolve(__dirname, '../..')
const SCANNED_DIRS = ['app', 'actions', 'lib', 'components']
const SKIPPED_DIRS = new Set(['node_modules', '__tests__', '__mocks__'])
const SKIPPED_PATHS = new Set(['lib/generated'])

const TOKEN_DEFINITION = 'lib/utils.ts'
const SHARE_LINK_ACTIONS = 'actions/wrapped-share-link.ts'
const ROSTER_STRIPPER = 'lib/wrapped/maintenance/strip-rosters.ts'

const PRISMA_WRITE_METHODS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
])
const RAW_QUERY_METHODS = new Set(['$executeRaw', '$executeRawUnsafe', '$queryRaw', '$queryRawUnsafe'])

interface Finding {
  file: string
  line: number
  /** The written value as source text, e.g. `null` or `minted`. */
  value: string
}

interface ScanResult {
  tokenMentions: Finding[]
  tokenCalls: Finding[]
  shareTokenWrites: Finding[]
}

function listSourceFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !SKIPPED_PATHS.has(relative)) {
        files.push(...listSourceFiles(relative))
      }
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(relative)
    }
  }
  return files
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text
  if (ts.isComputedPropertyName(name) && ts.isStringLiteral(name.expression)) return name.expression.text
  return undefined
}

/** Scans one file's source text for token mentions, token calls and shareToken writes. */
function scanSource(file: string, text: string): ScanResult {
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  const result: ScanResult = { tokenMentions: [], tokenCalls: [], shareTokenWrites: [] }
  const lineOf = (node: ts.Node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  const finding = (node: ts.Node, value: string): Finding => ({ file, line: lineOf(node), value })

  // Same-file variables, so `data: payload` and `...payload` are followed.
  const initializers = new Map<string, ts.Expression[]>()
  const collectInitializers = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      initializers.set(node.name.text, [...(initializers.get(node.name.text) ?? []), node.initializer])
    }
    ts.forEachChild(node, collectInitializers)
  }
  collectInitializers(sourceFile)

  const seenPayloads = new Set<ts.Node>()
  const recordPayloadWrites = (node: ts.Expression) => {
    if (seenPayloads.has(node)) return
    seenPayloads.add(node)

    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (ts.isShorthandPropertyAssignment(property) && property.name.text === 'shareToken') {
          result.shareTokenWrites.push(finding(property, property.name.text))
        } else if (ts.isPropertyAssignment(property)) {
          if (propertyNameText(property.name) === 'shareToken') {
            result.shareTokenWrites.push(finding(property, property.initializer.getText(sourceFile)))
          } else {
            // Nested writes, e.g. `data: { plexWrapped: { update: { data: ... } } }`
            recordPayloadWrites(property.initializer)
          }
        } else if (ts.isSpreadAssignment(property)) {
          recordPayloadWrites(property.expression)
        }
      }
    } else if (ts.isConditionalExpression(node)) {
      recordPayloadWrites(node.whenTrue)
      recordPayloadWrites(node.whenFalse)
    } else if (ts.isBinaryExpression(node)) {
      recordPayloadWrites(node.left)
      recordPayloadWrites(node.right)
    } else if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      recordPayloadWrites(node.expression)
    } else if (ts.isIdentifier(node)) {
      for (const initializer of initializers.get(node.text) ?? []) {
        recordPayloadWrites(initializer)
      }
    }
  }

  const recordWriteCall = (call: ts.CallExpression, method: string) => {
    const payloadKeys = method === 'upsert' ? ['create', 'update'] : ['data']
    let args: ts.Expression | undefined = call.arguments[0]
    if (args && ts.isIdentifier(args)) {
      args = initializers.get(args.text)?.find(ts.isObjectLiteralExpression)
    }
    if (!args || !ts.isObjectLiteralExpression(args)) return
    for (const property of args.properties) {
      if (ts.isPropertyAssignment(property) && payloadKeys.includes(propertyNameText(property.name) ?? '')) {
        recordPayloadWrites(property.initializer)
      } else if (ts.isShorthandPropertyAssignment(property) && payloadKeys.includes(property.name.text)) {
        recordPayloadWrites(property.name)
      }
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node) && node.text === 'generateShareToken') {
      result.tokenMentions.push(finding(node, node.text))
    }

    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : undefined
      if (calleeName === 'generateShareToken') {
        result.tokenCalls.push(finding(node, node.getText(sourceFile)))
      }
      if (ts.isPropertyAccessExpression(callee) && PRISMA_WRITE_METHODS.has(callee.name.text)) {
        recordWriteCall(node, callee.name.text)
      }
      if (calleeName && RAW_QUERY_METHODS.has(calleeName) && /share_?token/i.test(node.getText(sourceFile))) {
        result.shareTokenWrites.push(finding(node, 'raw query'))
      }
    }

    if (ts.isTaggedTemplateExpression(node)) {
      const tag = node.tag
      const tagName = ts.isPropertyAccessExpression(tag) ? tag.name.text : ts.isIdentifier(tag) ? tag.text : undefined
      if (tagName && RAW_QUERY_METHODS.has(tagName) && /share_?token/i.test(node.template.getText(sourceFile))) {
        result.shareTokenWrites.push(finding(node, 'raw query'))
      }
    }

    // `row.shareToken = value` or `row['shareToken'] = value`
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const target = node.left
      const assignsShareToken =
        (ts.isPropertyAccessExpression(target) && target.name.text === 'shareToken') ||
        (ts.isElementAccessExpression(target) &&
          ts.isStringLiteral(target.argumentExpression) &&
          target.argumentExpression.text === 'shareToken')
      if (assignsShareToken) {
        result.shareTokenWrites.push(finding(node, node.right.getText(sourceFile)))
      }
    }

    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  return result
}

function scanRepository(): ScanResult & { fileCount: number } {
  const files = SCANNED_DIRS.flatMap(listSourceFiles)
  const total: ScanResult = { tokenMentions: [], tokenCalls: [], shareTokenWrites: [] }
  for (const file of files) {
    const scanned = scanSource(file, fs.readFileSync(path.join(ROOT, file), 'utf8'))
    total.tokenMentions.push(...scanned.tokenMentions)
    total.tokenCalls.push(...scanned.tokenCalls)
    total.shareTokenWrites.push(...scanned.shareTokenWrites)
  }
  return { ...total, fileCount: files.length }
}

const describeFinding = (f: Finding) => `${f.file}:${f.line} (${f.value})`

describe('the scanner', () => {
  const writesIn = (source: string) => scanSource('example.ts', source).shareTokenWrites.map((f) => f.value)

  it('finds a shareToken key in a data payload, directly or through a variable', () => {
    expect(writesIn('prisma.plexWrapped.update({ where: { id }, data: { shareToken } })')).toEqual(['shareToken'])
    expect(writesIn('prisma.plexWrapped.update({ where: { id }, data: { status: "x", shareToken: t } })')).toEqual(['t'])
    expect(
      writesIn('const data = { shareToken: minted }\nawait tx.plexWrapped.updateMany({ where: { id }, data })')
    ).toEqual(['minted'])
    expect(writesIn('const args = { where: { id }, data: { shareToken: null } }\nprisma.plexWrapped.update(args)')).toEqual([
      'null',
    ])
  })

  it('finds the token minting that generation used to do', () => {
    const before = [
      'const shareToken = existingWrapped?.shareToken || generateShareToken()',
      'await prisma.plexWrapped.upsert({',
      '  where: { userId_year: { userId, year } },',
      '  create: { userId, year, status: "generating", shareToken },',
      '  update: { status: "generating", ...(existingWrapped?.shareToken ? {} : { shareToken }) },',
      '})',
    ].join('\n')

    const scanned = scanSource('example.ts', before)

    expect(scanned.shareTokenWrites).toHaveLength(2)
    expect(scanned.tokenCalls).toHaveLength(1)
  })

  it('finds nested writes, string keys, property assignments and raw queries', () => {
    expect(writesIn('prisma.user.update({ where: { id }, data: { wraps: { update: { data: { shareToken: t } } } } })')).toEqual([
      't',
    ])
    expect(writesIn('prisma.plexWrapped.create({ data: { "shareToken": t } as Prisma.PlexWrappedCreateInput })')).toEqual(['t'])
    expect(writesIn('row.shareToken = t')).toEqual(['t'])
    expect(writesIn('prisma.$executeRaw`UPDATE "PlexWrapped" SET "shareToken" = ${t}`')).toEqual(['raw query'])
  })

  it('ignores reads, filters and DTO fields', () => {
    expect(writesIn('prisma.plexWrapped.findUnique({ where: { shareToken: token } })')).toEqual([])
    expect(writesIn('prisma.plexWrapped.updateMany({ where: { shareToken: null }, data: { status: "x" } })')).toEqual([])
    expect(writesIn('prisma.plexWrapped.findMany({ select: { shareToken: true } })')).toEqual([])
    expect(writesIn('return { id: w.id, shareToken: w.shareToken }')).toEqual([])
    expect(writesIn('if (row.shareToken === t) {}')).toEqual([])
  })
})

describe('share token writers', () => {
  const scan = scanRepository()

  it('scans the application source', () => {
    expect(scan.fileCount).toBeGreaterThan(300)
  })

  it('mentions generateShareToken only where it is defined and in the share-link actions', () => {
    const files = [...new Set(scan.tokenMentions.map((f) => f.file))].sort()
    expect(files).toEqual([SHARE_LINK_ACTIONS, TOKEN_DEFINITION].sort())
    expect(scan.tokenMentions.filter((f) => f.file === TOKEN_DEFINITION)).toHaveLength(1)
  })

  it('calls generateShareToken only from the share-link actions', () => {
    expect(scan.tokenCalls.map(describeFinding)).toEqual(
      scan.tokenCalls.filter((f) => f.file === SHARE_LINK_ACTIONS).map(describeFinding)
    )
    expect(scan.tokenCalls.length).toBeGreaterThan(0)
  })

  it('writes shareToken only from the share-link actions and, as null, from the roster stripper', () => {
    const allowed = (f: Finding) =>
      f.file === SHARE_LINK_ACTIONS || (f.file === ROSTER_STRIPPER && f.value === 'null')

    expect(scan.shareTokenWrites.filter((f) => !allowed(f)).map(describeFinding)).toEqual([])
  })

  it('finds both share-link writes: the minted token and the revocation', () => {
    const values = scan.shareTokenWrites.filter((f) => f.file === SHARE_LINK_ACTIONS).map((f) => f.value)
    expect(values).toContain('null')
    expect(values.filter((value) => value !== 'null')).toHaveLength(1)
  })
})
