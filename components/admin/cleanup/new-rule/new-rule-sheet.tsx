"use client"

import Link from "next/link"
import { type ReactElement, useLayoutEffect, useState } from "react"

import { RecipeStep } from "@/components/admin/cleanup/new-rule/recipe-step"
import { RECIPE_LEVEL_NAMES, todayText } from "@/components/admin/cleanup/new-rule/recipe-words"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cleanupNewRule } from "@/lib/admin/routes"
import type { RecipeId } from "@/lib/cleanup/constants"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"
import { useFormat } from "@/lib/format-context"

export interface NewRuleSheetProps {
  /** The element that opens the Sheet, such as the header's "New rule" button. Omit it when `open` is controlled. */
  trigger?: ReactElement
  /**
   * A controlled Sheet. Its owner closes it as the router hides the page (TS
   * 12.1 rule 8.2), with a `useLayoutEffect` cleanup that sets its own state.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The ten recipes in gallery order, with today's counts (`CleanupOverviewData.recipes`). */
  recipes: readonly RecipeCardData[]
  /** Opens at the recipe step of this recipe (a recipe card on first use, UX 4.2.1 item 5), else at the list. */
  recipeId?: RecipeId | null
  /** The Settings grace period (`options.defaults.graceDays`), preselected in each recipe. */
  graceDays?: number | null
  /** The render's clock, for "today". */
  now?: number
}

/** One picker row: name, level and today's count (UX 4.2.1 item 2). A recipe that needs a missing service does not open. */
function RecipeRow({ recipe, onPick }: { recipe: RecipeCardData; onPick: (id: RecipeId) => void }) {
  const f = useFormat()
  const today = todayText(recipe, f)
  const needs = recipe.needs.map((service) => SERVICE_NAMES[service]).join(" and ")
  return (
    <li>
      <Button
        variant="ghost"
        className="h-auto w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left whitespace-normal"
        disabled={needs !== ""}
        onClick={() => onPick(recipe.id)}
        data-testid={`admin-cleanup-new-rule-recipe-${recipe.id}`}
      >
        <span className="text-ui font-medium text-foreground">{recipe.name}</span>
        <span className="text-label font-normal text-muted-foreground">
          {[RECIPE_LEVEL_NAMES[recipe.level], needs ? `Needs ${needs}` : today].filter(Boolean).join(". ")}
        </span>
      </Button>
    </li>
  )
}

/**
 * "New rule" (UX 4.2.1): a right Sheet of 420 px, or a bottom Sheet with a
 * grabber below `md`. It lists the ten recipes and "Start from a blank
 * rule". A recipe replaces the list with its recipe step, which has "Back to
 * recipes" above its title. Each open starts at `recipeId`, or at the list.
 * An uncontrolled Sheet closes as the router hides the page (TS 12.1 rule
 * 8.2), as `ConfirmDialog` does.
 */
export function NewRuleSheet({ trigger, open: openProp, onOpenChange, recipes, recipeId = null, graceDays, now }: NewRuleSheetProps) {
  const wide = useMediaQuery("(min-width: 48rem)")
  const [openedAt] = useState(() => Date.now())
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const [step, setStep] = useState<RecipeId | null>(recipeId)
  const [shown, setShown] = useState({ open, recipeId })
  if (shown.open !== open || shown.recipeId !== recipeId) {
    setShown({ open, recipeId })
    if (open) setStep(recipeId)
  }
  // The router keeps a page it leaves (Activity): an open Sheet closes as the page hides
  useLayoutEffect(() => () => setUncontrolledOpen(false), [])
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger && <SheetTrigger render={trigger} />}
      <SheetContent
        side={wide ? "right" : "bottom"}
        grabber={!wide}
        className="gap-6"
        data-testid={step ? "admin-cleanup-recipe-sheet" : "admin-cleanup-new-rule-sheet"}
      >
        {step ? (
          <RecipeStep key={step} recipeId={step} graceDays={graceDays} now={now ?? openedAt} onBack={() => setStep(null)} onDone={() => setOpen(false)} />
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>New rule</SheetTitle>
              <SheetDescription>Pick a recipe. Set 2 or 3 values and see today&apos;s matches. The rule saves in Dry run.</SheetDescription>
            </SheetHeader>
            <ul className="-mx-3 flex flex-col gap-1">
              {recipes.map((recipe) => (
                <RecipeRow key={recipe.id} recipe={recipe} onPick={setStep} />
              ))}
              <li>
                <Button
                  variant="ghost"
                  className="h-auto w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left whitespace-normal"
                  nativeButton={false}
                  render={<Link href={cleanupNewRule()} onClick={() => setOpen(false)} />}
                  data-testid="admin-cleanup-new-rule-blank"
                >
                  <span className="text-ui font-medium text-foreground">Start from a blank rule</span>
                  <span className="text-label font-normal text-muted-foreground">
                    Pick the level and the library. The editor starts with one condition, Added more than 90 days ago, and the global protections.
                  </span>
                </Button>
              </li>
            </ul>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
