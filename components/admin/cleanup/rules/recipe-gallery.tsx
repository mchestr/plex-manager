"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useLayoutEffect, useState } from "react"

import { NewRuleSheet } from "@/components/admin/cleanup/new-rule/new-rule-sheet"
import { RecipeCard } from "@/components/admin/cleanup/rules/recipe-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { cleanupNewRule } from "@/lib/admin/routes"
import type { RecipeId } from "@/lib/cleanup/constants"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"

/** UX 8.2. */
const BLANK_LINE = "Pick the level and the library. The editor starts with one condition,"

interface RecipeGalleryProps {
  /** The ten recipes in gallery order (TS 12.7 item 2). */
  recipes: readonly RecipeCardData[]
  /** The Settings grace period, preselected in each recipe. */
  graceDays: number
  /** The page's clock, for "today" in the Sheet. */
  now: number
}

/**
 * The recipe gallery of the first-use state (UX 4.1.1): a card for each of
 * the ten recipes, three across from `lg` and two from `md`, and the blank
 * card over two columns. "Use this recipe" opens the New rule Sheet at that
 * recipe's step; the blank card opens a blank movie rule in the editor. The
 * Sheet closes as the router hides the page (TS 12.1 rule 8.2).
 */
export function RecipeGallery({ recipes, graceDays, now }: RecipeGalleryProps) {
  const [recipeId, setRecipeId] = useState<RecipeId | null>(null)
  const [open, setOpen] = useState(false)

  // The router keeps a page it leaves (Activity): an open Sheet closes as the page hides
  useLayoutEffect(() => () => setOpen(false), [])

  const use = (id: RecipeId) => {
    setRecipeId(id)
    setOpen(true)
  }

  return (
    <>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-label="Recipes" data-testid="admin-cleanup-recipes">
        {recipes.map((recipe) => (
          <li key={recipe.id} className="flex">
            <RecipeCard recipe={recipe} onUse={use} />
          </li>
        ))}
        <li className="flex md:col-span-2">
          <Card className="w-full gap-4 border-dashed p-5" data-testid="admin-cleanup-recipe-blank">
            <div className="flex flex-col gap-1">
              <p className="text-label text-muted-foreground">Any level</p>
              <h3 className="text-h3 text-foreground">Start from a blank rule</h3>
            </div>
            <p className="text-ui leading-7 text-muted-foreground">
              {BLANK_LINE}{" "}
              <strong className="rounded-sm border border-border-strong bg-secondary px-1.5 py-0.5 font-semibold whitespace-nowrap text-foreground">
                Added more than 90 days ago
              </strong>
              , and the global protections.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-auto self-end"
              icon={<Icon icon={Plus} />}
              nativeButton={false}
              render={<Link href={cleanupNewRule({ level: "movie" })} />}
              data-testid="admin-cleanup-recipe-blank-start"
            >
              Start from a blank rule
            </Button>
          </Card>
        </li>
      </ul>
      <NewRuleSheet open={open} onOpenChange={setOpen} recipes={recipes} recipeId={recipeId} graceDays={graceDays} now={now} />
    </>
  )
}
