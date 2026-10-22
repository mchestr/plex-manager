/**
 * The `?schema=` parameter of `DATABASE_URL` (GAP-19).
 *
 * The Prisma CLI has always honoured it (`prisma.config.ts` hands it the same
 * URL), but the pg driver adapter ignores URL parameters it does not know, so
 * queries ran against `public` while migrations went to the named schema.
 * `createPrismaClient()` now passes the schema to `PrismaPg` as its `schema`
 * option, and `checkProductionEnv` stops boot on a name Postgres would not
 * accept unquoted. Not `server-only`: `prisma/seed.ts` loads it too.
 */

const SCHEMA_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/

/** The raw `schema` search parameter of `url`, or null when there is none (or the URL does not parse). */
export function schemaParamOf(url: string): string | null {
  return URL.canParse(url) ? new URL(url).searchParams.get("schema") : null
}

/** Whether `name` is a schema name the app accepts: an unquoted identifier of at most 63 characters. */
export function isValidSchemaName(name: string): boolean {
  return SCHEMA_NAME.test(name)
}

/**
 * The second argument for `new PrismaPg(config, options)`: `{ schema }` when
 * `url` names a schema other than `public`, otherwise undefined (the adapter's
 * default).
 *
 * @throws Error when the name is not valid; in production `assertBootEnv`
 *   reports it first, as `DATABASE_URL` `schema_invalid`.
 */
export function pgAdapterOptionsFor(url: string): { schema: string } | undefined {
  const schema = schemaParamOf(url)
  if (schema === null || schema === "public") return undefined
  if (!isValidSchemaName(schema)) {
    throw new Error("DATABASE_URL ?schema= must be a letter or _ followed by up to 62 letters, digits or _")
  }
  return { schema }
}
