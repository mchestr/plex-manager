import { notFound } from "next/navigation"
import { connection } from "next/server"
import { z } from "zod"

import { RuleEditor } from "@/components/admin/cleanup/editor/rule-editor"
import { assertAdmin } from "@/lib/admin"
import { RECIPE_IDS, type RecipeId } from "@/lib/cleanup/constants"
import { stableJson } from "@/lib/cleanup/editor/stable-json"
import { getRecipe } from "@/lib/cleanup/recipes"
import { getCleanupRuleEditor } from "@/lib/data/cleanup-editor"
import { isRedisConfigured } from "@/lib/queue/connection"
import { LEVELS, type Level } from "@/lib/validations/cleanup-vocabulary"

type SearchParams = Record<string, string | string[] | undefined>

const startSchema = z.object({
  recipe: z.enum(RECIPE_IDS).optional().catch(undefined),
  level: z.enum(LEVELS).optional().catch(undefined),
})
/** A key value in its URL form: "180d", "2y", or digits. The recipe's own schema checks it (TS 6.10). */
const valueSchema = z.string().max(30)

/** The parsed start of a new rule: a recipe with its key values, or a blank rule of a level (Movies by default). */
interface NewRuleStart {
  recipe?: RecipeId
  values: Record<string, string>
  level: Level | null
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/**
 * The start from `?recipe=<id>&<key>=<value>&level=` (UX 3.1, TS 12.2). Only
 * the recipe's own keys count, so another parameter never makes another
 * start. A bad recipe id or level drops out.
 */
function parseStart(params: SearchParams): NewRuleStart {
  const { recipe, level } = startSchema.parse({ recipe: first(params.recipe), level: first(params.level) })
  if (!recipe) return { values: {}, level: level ?? "movie" }
  const values = Object.fromEntries(
    getRecipe(recipe).keys.flatMap(({ key }) => {
      const parsed = valueSchema.safeParse(first(params[key]))
      return parsed.success ? [[key, parsed.data]] : []
    })
  )
  return { recipe, values, level: level ?? null }
}

/**
 * The new-rule editor (UX 4.2.2, 4.3): a blank rule ("Start from a blank
 * rule", `?level=movie`) or a recipe with its values ("Change all
 * conditions"). Search params do not make a new route segment, so the router
 * keeps one instance for every start. The editor's `key` is the parsed start:
 * another start mounts a fresh editor (TS 12.6 editor item 1.7).
 */
export default async function NewCleanupRulePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await assertAdmin()
  // The preview reads the newest library data and the clock: render per request
  await connection()
  const start = parseStart(await searchParams)
  const now = new Date()
  const input = start.recipe ? { recipe: start.recipe, values: start.values, level: start.level } : { level: start.level ?? "movie" }
  const data = await getCleanupRuleEditor(input, now)
  if (!data) notFound()
  return <RuleEditor key={stableJson(start)} data={data} now={now.getTime()} redis={isRedisConfigured()} />
}
