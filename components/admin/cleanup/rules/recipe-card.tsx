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
import type { WhyPart } from "@/lib/cleanup/engine/types"
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

/**
 * The first sentence of a rule: what it matches. The protections and the
 * Then part read the same in every recipe, and the recipe step shows them.
 */
export function firstSentence(parts: readonly WhyPart[]): WhyPart[] {
  const sentence: WhyPart[] = []
  for (const part of parts) {
    const end = part.strong ? -1 : part.text.search(/\.(\s|$)/)
    if (end >= 0) return [...sentence, { ...part, text: part.text.slice(0, end + 1) }]
    sentence.push(part)
  }
  return sentence
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** A bold value with each key value in it as a value chip: "were added more than [180 days] ago". */
function StrongWithChips({ text, keys }: { text: string; keys: readonly string[] }) {
  const pattern = keys.length > 0 ? new RegExp(`(${[...keys].sort((a, b) => b.length - a.length).map(escape).join("|")})`) : null
  const pieces = pattern ? text.split(pattern) : [text]
  return (
    <strong className="font-semibold text-foreground">
      {pieces.map((piece, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded-sm border border-border-strong bg-secondary px-1.5 py-0.5 whitespace-nowrap" data-slot="value-chip">
            {piece}
          </span>
        ) : (
          piece
        )
      )}
    </strong>
  )
}

/** The sentence of a recipe (UX 4.1.1): what it matches, its key values as value chips and the other values in bold. */
function RecipeSentence({ recipe }: { recipe: RecipeCardData }) {
  return (
    <p className="text-ui leading-7 text-muted-foreground" data-testid={`admin-cleanup-recipe-${recipe.id}-sentence`}>
      {firstSentence(recipe.sentence).map((part, i) =>
        part.strong ? <StrongWithChips key={i} text={part.text} keys={recipe.keyValues} /> : <span key={i}>{part.text}</span>
      )}
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
