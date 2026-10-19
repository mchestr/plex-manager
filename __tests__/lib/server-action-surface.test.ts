/**
 * @jest-environment node
 */

/**
 * Every export of a `"use server"` module is a Server Action that anyone can
 * call with arguments of their choosing. An action that takes the URL (or the
 * API key) of the service it contacts lets an unauthenticated caller point the
 * server at any host (SEC-35). This suite parses every such module under
 * `actions/`, `app/`, `components/`, `hooks/` and `lib/` with the TypeScript
 * compiler and checks that:
 *
 * - the Jellyfin sign-in helpers and the connection clients are not actions;
 * - no exported action outside the admin and setup actions takes a target.
 *   An action takes one when, matching names case-insensitively against
 *   `TARGET_NAME` (a name ending in url, uri, host, endpoint, apiKey or token):
 *   - a parameter's name matches (destructured names included);
 *   - a parameter's type has a matching property;
 *   - its body reads a matching key from a FormData (`formData.get("url")`);
 *   - its body parses a parameter with a schema (`.parse`, `.safeParse` and
 *     their async forms) whose output has a matching property, which covers
 *     `unknown` inputs validated with Zod.
 *
 *   The admin and setup actions save and test connection settings, so they
 *   take URLs by design; they check the session (admin) or the setup state,
 *   and P11.32 and P4.6 tighten them. Matches elsewhere that carry a
 *   credential for a fixed or stored host are listed, each with the reason,
 *   in `REVIEWED_CREDENTIAL_INPUTS`.
 *
 * A fixture module proves the detector flags each shape.
 */

import fs from 'node:fs'
import path from 'node:path'

import * as ts from 'typescript'

const ROOT = path.resolve(__dirname, '../..')
const SOURCE_DIRECTORIES = ['actions', 'app', 'components', 'hooks', 'lib']
const TARGET_NAME = /(url|uri|host|endpoint|apikey|token)$/i
const PARSE_METHODS = new Set(['parse', 'safeParse', 'parseAsync', 'safeParseAsync'])

/**
 * Findings outside the allow-list that were checked and take a credential
 * for a fixed or stored host, not a target. Each must still be found, so an
 * entry goes when its input changes and gets checked again.
 */
const REVIEWED_CREDENTIAL_INPUTS: Record<string, string> = {
  'actions/auth.ts checkServerAccess(input: { token: string; isInviteFlow: boolean; })':
    "the caller's own Plex token, sent only to https://plex.tv/api/v2/user; the server comes from the database",
  'actions/invite.ts processInvite(input: { code: string; plexAuthToken: string; })':
    "the invitee's own Plex token, sent only to plex.tv (user info and shared_servers accept)",
  'actions/discord.ts updateDiscordIntegrationSettings(parse(...) -> botToken)':
    'requireAdmin(); stores the Discord bot token, which the bot sends only to Discord',
}

const FIXTURE = path.join(__dirname, 'fixtures/server-action-surface/target-inputs.ts')

function createProgram(files: string[]): ts.Program {
  const config = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), ts.sys.readFile)
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT)
  return ts.createProgram(files, { ...options, noEmit: true, incremental: false })
}

/** Repo-relative paths of the modules allowed to take a target URL. */
function isAllowListed(relativePath: string): boolean {
  return relativePath.startsWith('actions/admin/') || /^actions\/setup[^/]*\.ts$/.test(relativePath)
}

function listSourceFiles(directory: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!['node_modules', '__tests__', 'generated'].includes(entry.name)) {
        listSourceFiles(fullPath, files)
      }
    } else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath)
    }
  }
  return files
}

/** True when the module's directive prologue contains `"use server"`. */
function hasUseServerDirective(sourceFile: ts.SourceFile): boolean {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false
    }
    if (statement.expression.text === 'use server') {
      return true
    }
  }
  return false
}

function parse(filePath: string): ts.SourceFile {
  return ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true)
}

function relative(filePath: string): string {
  return path.relative(ROOT, filePath).split(path.sep).join('/')
}

/** The names a parameter binds, including destructured ones. */
function boundNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text]
  }
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : boundNames(element.name)
  )
}

/** The first property of `type` (or of any member of a union) whose name matches `TARGET_NAME`. */
function targetProperty(checker: ts.TypeChecker, type: ts.Type): string | undefined {
  const members = type.isUnion() ? type.types : [type]
  for (const member of members) {
    const match = checker.getPropertiesOfType(member).find((property) => TARGET_NAME.test(property.getName()))
    if (match) {
      return match.getName()
    }
  }
  return undefined
}

/**
 * The functions an exported declaration runs when called: the function
 * itself, or the function arguments of the wrapper it is built with
 * (`export const action = wrap(async (input) => { ... })`).
 */
function callableBodies(declaration: ts.Declaration): ts.SignatureDeclaration[] {
  if (ts.isFunctionDeclaration(declaration)) {
    return [declaration]
  }
  if (!ts.isVariableDeclaration(declaration) || !declaration.initializer) {
    return []
  }
  const initializer = declaration.initializer
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return [initializer]
  }
  if (ts.isCallExpression(initializer)) {
    return initializer.arguments.filter(
      (argument): argument is ts.ArrowFunction | ts.FunctionExpression =>
        ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)
    )
  }
  return []
}

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

/** What a `.parse`/`.safeParse` call (or its async form) returns on success. */
function parsedOutputs(checker: ts.TypeChecker, call: ts.CallExpression, method: string): ts.Type[] {
  let type = checker.getTypeAtLocation(call)
  if (method.endsWith('Async')) {
    type = checker.getAwaitedType(type) ?? type
  }
  if (!method.startsWith('safe')) {
    return [type]
  }
  const members = type.isUnion() ? type.types : [type]
  return members.flatMap((member) => {
    const data = checker.getPropertyOfType(member, 'data')
    return data ? [checker.getTypeOfSymbolAtLocation(data, call)] : []
  })
}

/** Findings from the body of one function an action runs. */
function findTargetsInBody(checker: ts.TypeChecker, fn: ts.SignatureDeclaration): string[] {
  const body = (fn as ts.FunctionLikeDeclaration).body
  if (!body) {
    return []
  }
  const parameterSymbols = new Set(
    fn.parameters.flatMap((parameter) => {
      const symbol = checker.getSymbolAtLocation(parameter.name)
      return symbol ? [symbol] : []
    })
  )
  const referencesParameter = (node: ts.Node): boolean => {
    let found = false
    walk(node, (child) => {
      if (ts.isIdentifier(child)) {
        const symbol = checker.getSymbolAtLocation(child)
        if (symbol && parameterSymbols.has(symbol)) {
          found = true
        }
      }
    })
    return found
  }

  const findings: string[] = []
  walk(body, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
      return
    }
    const method = node.expression.name.text
    const [firstArgument] = node.arguments

    if ((method === 'get' || method === 'getAll') && firstArgument && ts.isStringLiteralLike(firstArgument)) {
      const receiver = checker.getTypeAtLocation(node.expression.expression).getSymbol()?.getName()
      if (receiver === 'FormData' && TARGET_NAME.test(firstArgument.text)) {
        findings.push(`formData.${method}("${firstArgument.text}")`)
      }
    }

    if (PARSE_METHODS.has(method) && node.arguments.some(referencesParameter)) {
      for (const output of parsedOutputs(checker, node, method)) {
        const property = targetProperty(checker, output)
        if (property) {
          findings.push(`${method}(...) -> ${property}`)
        }
      }
    }
  })
  return findings
}

/**
 * Lists `file export(detail)` for every exported function that takes a
 * target URL, host or credential in one of the shapes the header describes.
 */
function findTargetInputs(program: ts.Program, files: string[]): string[] {
  const checker = program.getTypeChecker()
  const findings: string[] = []

  for (const file of files) {
    const sourceFile = program.getSourceFile(file)
    const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile)
    if (!sourceFile || !moduleSymbol) {
      throw new Error(`TypeScript could not load ${relative(file)}`)
    }

    for (const exported of checker.getExportsOfModule(moduleSymbol)) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported
      const report = (detail: string) => findings.push(`${relative(file)} ${exported.getName()}(${detail})`)

      for (const signature of checker.getTypeOfSymbolAtLocation(symbol, sourceFile).getCallSignatures()) {
        for (const parameter of signature.getParameters()) {
          const declaration = parameter.valueDeclaration
          if (!declaration || !ts.isParameter(declaration)) {
            continue
          }
          const type = checker.getTypeOfSymbolAtLocation(parameter, declaration)
          const matchingName = boundNames(declaration.name).find((name) => TARGET_NAME.test(name))
          const property = targetProperty(checker, type)
          if (matchingName || property) {
            report(`${parameter.getName()}: ${checker.typeToString(type)}`)
          }
        }
      }

      for (const declaration of symbol.declarations ?? []) {
        for (const fn of callableBodies(declaration)) {
          findTargetsInBody(checker, fn).forEach(report)
        }
      }
    }
  }

  return findings
}

describe('Server Action surface (SEC-35)', () => {
  const candidates = SOURCE_DIRECTORIES.flatMap((directory) => listSourceFiles(path.join(ROOT, directory)))
  const serverActionFiles = candidates.filter((file) => hasUseServerDirective(parse(file)))

  let findings: string[] = []
  let fixtureFindings: string[] = []

  beforeAll(() => {
    const program = createProgram([...serverActionFiles, FIXTURE])
    findings = findTargetInputs(program, serverActionFiles)
    fixtureFindings = findTargetInputs(program, [FIXTURE])
  }, 60_000)

  it('scans every source directory', () => {
    const scanned = new Set(candidates.map((file) => relative(file).split('/')[0]))
    expect([...scanned].sort()).toEqual([...SOURCE_DIRECTORIES].sort())
  })

  it('finds the Server Action modules', () => {
    const files = serverActionFiles.map(relative)
    expect(files).toEqual(expect.arrayContaining(['actions/invite.ts', 'actions/setup.ts', 'lib/plex-auth.ts']))
  })

  it('keeps lib/jellyfin-auth.ts server-only and out of the actions', () => {
    const sourceFile = parse(path.join(ROOT, 'lib/jellyfin-auth.ts'))
    const imports = sourceFile.statements
      .filter(ts.isImportDeclaration)
      .map((statement) => (statement.moduleSpecifier as ts.StringLiteral).text)

    expect(hasUseServerDirective(sourceFile)).toBe(false)
    expect(imports).toContain('server-only')
  })

  it('has no "use server" module under lib/connections', () => {
    const connectionActions = serverActionFiles.map(relative).filter((file) => file.startsWith('lib/connections/'))
    expect(connectionActions).toEqual([])
  })

  it('detects URL and API-key parameters (the allow-listed admin and setup actions take them)', () => {
    const allowListed = findings.filter((finding) => isAllowListed(finding.split(' ')[0]))
    expect(allowListed.length).toBeGreaterThan(0)
  })

  it('detects every input shape: names, properties, FormData keys and parsed inputs, in any case', () => {
    const flagged = new Set(fixtureFindings.map((finding) => finding.split(' ')[1].split('(')[0]))

    expect([...flagged].sort()).toEqual(
      [
        'destructuredParameter',
        'formDataKey',
        'namedParameter',
        'parsedUnknownInput',
        'typedProperty',
        'wrappedParsedInput',
      ].sort()
    )
    expect(fixtureFindings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('namedParameter(serverURL: string)'),
        expect.stringContaining('formDataKey(formData.get("publicUrl"))'),
        expect.stringContaining('parsedUnknownInput(safeParse(...) -> jellyfinEndpoint)'),
        expect.stringContaining('wrappedParsedInput(parse(...) -> jellyfinEndpoint)'),
      ])
    )
  })

  it('still finds every reviewed credential input', () => {
    expect(findings).toEqual(expect.arrayContaining(Object.keys(REVIEWED_CREDENTIAL_INPUTS)))
  })

  it('has no exported action outside admin and setup that takes a target URL or API key', () => {
    const offenders = findings.filter(
      (finding) => !isAllowListed(finding.split(' ')[0]) && !(finding in REVIEWED_CREDENTIAL_INPUTS)
    )
    expect(offenders).toEqual([])
  })
})
