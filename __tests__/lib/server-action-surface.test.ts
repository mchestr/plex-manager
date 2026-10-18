/**
 * @jest-environment node
 */

/**
 * Every export of a `"use server"` module is a Server Action that anyone can
 * call with arguments of their choosing. An action that takes the URL (or the
 * API key) of the service it contacts lets an unauthenticated caller point the
 * server at any host (SEC-35). This suite parses every such module under
 * `actions/` and `lib/` with the TypeScript compiler and checks that:
 *
 * - the Jellyfin sign-in helpers and the connection clients are not actions;
 * - no exported action outside the admin and setup actions takes a parameter
 *   named `url`, `baseUrl` or `serverUrl`, or one whose type has a `url` or
 *   `apiKey` property. The admin and setup actions save and test connection
 *   settings, so they take URLs by design; they check the session (admin) or
 *   the setup state, and P11.32 and P4.6 tighten them.
 */

import fs from 'node:fs'
import path from 'node:path'

import * as ts from 'typescript'

const ROOT = path.resolve(__dirname, '../..')
const URL_PARAMETER_NAMES = new Set(['url', 'baseUrl', 'serverUrl'])
const URL_PROPERTIES = ['url', 'apiKey']

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

/**
 * Lists `file export(parameter: type)` for every exported function parameter
 * that names or carries a target URL or API key.
 */
function findUrlParameters(program: ts.Program, files: string[]): string[] {
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
      const signatures = checker.getTypeOfSymbolAtLocation(symbol, sourceFile).getCallSignatures()

      for (const signature of signatures) {
        for (const parameter of signature.getParameters()) {
          const declaration = parameter.valueDeclaration
          if (!declaration || !ts.isParameter(declaration)) {
            continue
          }
          const type = checker.getTypeOfSymbolAtLocation(parameter, declaration)
          const members = type.isUnion() ? type.types : [type]
          const namesUrl = boundNames(declaration.name).some((name) => URL_PARAMETER_NAMES.has(name))
          const carriesUrl = members.some((member) =>
            URL_PROPERTIES.some((property) => checker.getPropertyOfType(member, property))
          )
          if (namesUrl || carriesUrl) {
            findings.push(
              `${relative(file)} ${exported.getName()}(${parameter.getName()}: ${checker.typeToString(type)})`
            )
          }
        }
      }
    }
  }

  return findings
}

describe('Server Action surface (SEC-35)', () => {
  const candidates = [
    ...listSourceFiles(path.join(ROOT, 'actions')),
    ...listSourceFiles(path.join(ROOT, 'lib')),
  ]
  const serverActionFiles = candidates.filter((file) => hasUseServerDirective(parse(file)))

  let findings: string[] = []

  beforeAll(() => {
    const configPath = path.join(ROOT, 'tsconfig.json')
    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT)
    const program = ts.createProgram(serverActionFiles, { ...options, noEmit: true, incremental: false })
    findings = findUrlParameters(program, serverActionFiles)
  }, 60_000)

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

  it('has no exported action outside admin and setup that takes a target URL or API key', () => {
    const offenders = findings.filter((finding) => !isAllowListed(finding.split(' ')[0]))
    expect(offenders).toEqual([])
  })
})
