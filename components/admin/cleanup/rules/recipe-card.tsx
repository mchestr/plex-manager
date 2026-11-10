"use client"

import Link from "next/link"

import { RECIPE_LEVEL_NAMES } from "@/components/admin/cleanup/new-rule/recipe-words"
import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Poster } from "@/components/ui/poster"
import { Skeleton } from "@/components/ui/skeleton"
import { settingsSection } from "@/lib/admin/routes"
import type { RecipeId } from "@/lib/cleanup/constants"
import { joinAnd, nounWord, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"
import { useFormat } from "@/lib/format-context"
import type { BoundFormat } from "@/lib/utils/format"

/** "Today": "152 movies, 0.9 TB", or "38 movies or 21 shows" for a two-level recipe (UX 4.1.1). Null with no library data. */
export function recipeCount(recipe: Pick<RecipeCardData, "level" | "today">, f: BoundFormat): string | null {
  const { today, level } = recipe
  if (!today) return null
  if (level === "movieOrShow") {
    const shows = today.altCount ?? 0
    return `${f.number(today.count)} ${nounWord(today.count, "movie")} or ${f.number(shows)} ${nounWord(shows, "show")}`
  }
  return `${f.number(today.count)} ${nounWord(today.count, level)}, ${sizeText(today.bytes)}`
}

/** The sentence of a recipe: its key values as value chips (UX 4.1.1), the other values in bold. */
function RecipeSentence({ recipe }: { recipe: RecipeCardData }) {
  const keys = new Set(recipe.keyValues)
  return (
    <p className="text-ui leading-7 text-muted-foreground">
      {recipe.sentence.map((part, i) => {
        if (!part.strong) return <span key={i}>{part.text}</span>
        return keys.has(part.text) ? (
          <strong key={i} className="rounded-sm border border-border-strong bg-secondary px-1.5 py-0.5 font-semibold whitespace-nowrap text-foreground">
            {part.text}
          </strong>
        ) : (
          <strong key={i} className="font-semibold text-foreground">
            {part.text}
          </strong>
        )
      })}
    </p>
  )
}

/** A card note: "Good first rule. Its matches have no plays at all." The first of two sentences is the lead, in bold. */
function Note({ note }: { note: string }) {
  const split = note.match(/^(.+?[.!?])\s+(.+)$/)
  return (
    <p className="text-label text-muted-foreground">
      {split ? (
        <>
          <strong className="font-semibold text-foreground">{split[1]}</strong> {split[2]}
        </>
      ) : (
        note
      )}
    </p>
  )
}

interface RecipeCardProps {
  recipe: RecipeCardData
  /** Opens the New rule Sheet at this recipe's step (UX 4.2.1 item 5). */
  onUse: (id: RecipeId) => void
}

/**
 * One recipe of the first-use gallery (UX 4.1.1): the level, the name, the
 * sentence with its key values as chips, the five largest matches, an
 * optional note, and "Today" with the count and "Use this recipe". Three
 * states: before the first library read the count is a skeleton; a recipe
 * that needs a missing service says "Needs Sonarr" and links to its
 * settings; a two-level recipe counts both levels.
 */
export function RecipeCard({ recipe, onUse }: RecipeCardProps) {
  const f = useFormat()
  const id = `admin-cleanup-recipe-${recipe.id}`
  const needs = recipe.needs.map((service) => SERVICE_NAMES[service])
  const count = recipeCount(recipe, f)
  return (
    <Card className="w-full gap-4 p-5" data-testid={id}>
      <div className="flex flex-col gap-1">
        <p className="text-label text-muted-foreground">{RECIPE_LEVEL_NAMES[recipe.level]}</p>
        <h3 className="text-h3 text-foreground">{recipe.name}</h3>
      </div>
      <RecipeSentence recipe={recipe} />
      {recipe.posters.length > 0 && (
        <div aria-hidden="true" className="flex gap-2" data-testid={`${id}-posters`}>
          {recipe.posters.map((ratingKey) => (
            <Poster key={ratingKey} ratingKey={ratingKey} title="" size="xs" decorative />
          ))}
        </div>
      )}
      {recipe.note && <Note note={recipe.note} />}
      <div className="mt-auto flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-label text-muted-foreground">Today</p>
          {needs.length > 0 ? (
            <p className="text-ui font-semibold text-foreground" data-testid={`${id}-count`}>
              Needs {joinAnd(needs)}
            </p>
          ) : count === null ? (
            <Skeleton className="h-5 w-32" aria-hidden="true" data-testid={`${id}-count`} />
          ) : (
            <p className="text-ui font-semibold text-foreground tabular-nums" data-testid={`${id}-count`}>
              {count}
            </p>
          )}
        </div>
        {needs.length > 0 ? (
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={settingsSection(recipe.needs[0])} />} data-testid={`${id}-setup`}>
            Set up {needs[0]}
          </Button>
        ) : (
          <Button variant="outline" size="sm" aria-label={`Use this recipe: ${recipe.name}`} onClick={() => onUse(recipe.id)} data-testid={`${id}-use`}>
            Use this recipe
          </Button>
        )}
      </div>
    </Card>
  )
}
