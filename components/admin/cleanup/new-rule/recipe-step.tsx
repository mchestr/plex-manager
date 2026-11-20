"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

import { createCleanupRuleFromRecipe } from "@/actions/admin/cleanup-rules"
import { RecipeResult } from "@/components/admin/cleanup/new-rule/recipe-result"
import { otherValid, RecipeValueField } from "@/components/admin/cleanup/new-rule/recipe-value-field"
import { LEVEL_SEGMENTS, otherAmount, otherValue, RECIPE_CAPTIONS, RECIPE_DESCRIPTIONS, recipeLevelOf } from "@/components/admin/cleanup/new-rule/recipe-words"
import { useRecipePreview } from "@/components/admin/cleanup/new-rule/use-recipe-preview"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useToast } from "@/components/ui/toast"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { cleanupNewRule, cleanupRule } from "@/lib/admin/routes"
import type { RecipeId } from "@/lib/cleanup/constants"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { getRecipe, type RecipeKey, type RecipeValue, recipeValueParams } from "@/lib/cleanup/recipes"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** A typed "Other" value waits this long before the count asks again (UX 4.2.2 item 5). */
const TYPED_DELAY_MS = 500

interface RecipeStepProps {
  recipeId: RecipeId
  /** The Settings grace period, preselected when it is one of the chips. Without it the server uses the Settings default. */
  graceDays?: number | null
  /** The render's clock, for "today". */
  now: number
  onBack: () => void
  /** The rule was created, or the admin left for the editor: the Sheet closes. */
  onDone: () => void
}

type Values = Record<string, RecipeValue | undefined>

function startValues(keys: readonly RecipeKey[], graceDays: number | null | undefined): Values {
  return Object.fromEntries(keys.map((key) => [key.key, key.field === "grace" ? (graceDays ?? undefined) : key.default]))
}

/**
 * The recipe step of the New rule Sheet (UX 4.2.2): the caption, title and
 * description, the level choice of a two-level recipe with the count of
 * each level, one chip group per key value with its counts and "Other", the
 * live result, and the footer: "Change all conditions" opens the editor
 * with these values and nothing saved, "Create rule (dry run)" saves the
 * rule in Dry run and opens it. A chip press counts again at once, a typed
 * value after 500 ms.
 */
export function RecipeStep({ recipeId, graceDays, now, onBack, onDone }: RecipeStepProps) {
  const recipe = getRecipe(recipeId)
  const f = useFormat()
  const toast = useToast()
  const router = useRouter()
  const twoLevels = recipe.levels.length > 1
  const [level, setLevel] = useState<Level>(recipe.levels[0])
  const [values, setValues] = useState<Values>(() => startValues(recipe.keys, graceDays))
  const [others, setOthers] = useState<Record<string, number | null>>({})
  const [typing, setTyping] = useState(false)
  const [creating, startCreate] = useTransition()

  const othersValid = recipe.keys.every((key) => !(key.key in others) || otherValid(key, others[key.key]))
  const params = useMemo(() => recipeValueParams(values), [values])
  const sent = useDebouncedValue(params, typing ? TYPED_DELAY_MS : 0)
  const current = useRecipePreview({ recipeId, level, values: sent })
  const otherLevel = useRecipePreview({ recipeId, level: level === "movie" ? "show" : "movie", values: sent, enabled: twoLevels })
  const counts = { [level]: current.data?.matches, [level === "movie" ? "show" : "movie"]: otherLevel.data?.matches }
  const preview = current.data ?? null
  const needs = preview?.needs ?? []

  const pick = (key: RecipeKey, value: RecipeValue) => {
    setTyping(false)
    setOthers(({ [key.key]: _dropped, ...rest }) => rest)
    setValues((v) => ({ ...v, [key.key]: value }))
  }
  const typeOther = (key: RecipeKey, amount: number | null) => {
    setTyping(true)
    setOthers((o) => ({ ...o, [key.key]: amount }))
    if (otherValid(key, amount)) setValues((v) => ({ ...v, [key.key]: otherValue(key, amount) }))
  }

  const create = () =>
    startCreate(async () => {
      const result = await createCleanupRuleFromRecipe({ recipeId, ...(twoLevels ? { level: level === "show" ? "show" : "movie" } : {}), values: params })
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      toast.showSuccess("Rule created")
      onDone()
      router.push(cleanupRule(result.data.ruleId))
    })

  return (
    <>
      <SheetHeader className="gap-1 pr-8">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" icon={<Icon icon={icons.back} />} onClick={onBack} data-testid="admin-cleanup-new-rule-back">
          Back to recipes
        </Button>
        <p className="text-label text-muted-foreground">{RECIPE_CAPTIONS[recipeLevelOf(recipe)]}</p>
        <SheetTitle>{recipe.name}</SheetTitle>
        <SheetDescription>{RECIPE_DESCRIPTIONS[recipe.id]}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-6">
        {twoLevels && (
          <div className="flex flex-col gap-2">
            <SegmentedControl
              aria-label="Level"
              value={level}
              onValueChange={(next) => setLevel(next === "show" ? "show" : "movie")}
              data-testid="admin-cleanup-recipe-level"
            >
              {(["movie", "show"] as const).map((segment) => (
                <Segment key={segment} value={segment} data-testid={`admin-cleanup-recipe-level-${segment}`}>
                  {LEVEL_SEGMENTS[segment]}
                  {counts[segment] !== undefined && <span className="tabular-nums opacity-75">{f.number(counts[segment] ?? 0)}</span>}
                </Segment>
              ))}
            </SegmentedControl>
          </div>
        )}

        {recipe.keys.map((key) => (
          <RecipeValueField
            key={key.key}
            recipeKey={key}
            level={level}
            value={values[key.key]}
            other={key.key in others ? others[key.key] : undefined}
            counts={preview?.chips[key.key]}
            onChip={(value) => pick(key, value)}
            onOtherSelect={() => setOthers((o) => ({ ...o, [key.key]: otherAmount(key, values[key.key]) }))}
            onOtherChange={(amount) => typeOther(key, amount)}
          />
        ))}

        {needs.length > 0 && (
          <Alert tone="warning" title={`Needs ${needs.map((service) => SERVICE_NAMES[service]).join(" and ")}`}>
            Set up {needs.map((service) => SERVICE_NAMES[service]).join(" and ")} in Settings to use this recipe.
          </Alert>
        )}
        {current.error && <Alert tone="destructive">{current.error.message}</Alert>}

        <RecipeResult preview={preview} updating={current.isFetching && current.isPlaceholderData} now={now} />
      </div>

      <SheetFooter className="sticky -bottom-6 -mx-6 mt-auto border-t bg-popover px-6 py-4">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={cleanupNewRule({ recipe: recipeId, ...(twoLevels ? { level } : {}), values: params })} onClick={onDone} />}
          data-testid="admin-cleanup-recipe-change-all"
        >
          Change all conditions
        </Button>
        <Button
          onClick={create}
          loading={creating}
          loadingLabel="Creating"
          disabled={!othersValid || needs.length > 0 || !preview}
          data-testid="admin-cleanup-recipe-create"
        >
          Create rule (dry run)
        </Button>
      </SheetFooter>
    </>
  )
}
