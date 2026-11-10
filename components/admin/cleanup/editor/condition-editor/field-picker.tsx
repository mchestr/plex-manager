"use client"

import { Check, ChevronsUpDown } from "lucide-react"
import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Icon } from "@/components/ui/icon"
import type { RecipeId } from "@/lib/cleanup/constants"
import { anyFieldMeta, FIELD_GROUP_LABELS, FIELD_GROUPS, fieldDisabledReason, fieldsOfGroup } from "@/lib/cleanup/fields/catalog"
import { RECIPES } from "@/lib/cleanup/recipes"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import { cn } from "@/lib/utils"
import type { FieldId, Level } from "@/lib/validations/cleanup-vocabulary"

import { editorId, kebab, setUpIn } from "./editor-parts"

interface FieldPickerProps {
  field: FieldId
  level: Level
  /** The sources of the library data: a service that is not set up disables its fields. */
  sources: readonly SourceStatus[]
  /** The list is open. A new row opens with it, its search focused (UX 7.1 item 3). */
  open: boolean
  onOpenChange: (open: boolean) => void
  onChoose: (field: FieldId) => void
  /** "Other matches": a recipe whose name matches opens the recipe Sheet. Without it, recipes do not show. */
  onOpenRecipe?: (id: RecipeId) => void
  /** The id of the visible "Field" heading. */
  labelId: string
}

const matches = (text: string, query: string) => text.toLowerCase().includes(query)

/**
 * The field part of the condition editor (UX 4.4, UX 6): a trigger that
 * shows the field, and under it a `Command` list to find another one. The
 * list shows the four groups in order. A field of another level, or one
 * whose service is not set up, shows disabled with its reason. Typing
 * filters by name. A recipe whose name matches shows under "Other matches"
 * (UX 7.1). Up and Down move, Enter chooses (cmdk, `aria-activedescendant`).
 */
export function FieldPicker({ field, level, sources, open, onOpenChange, onChoose, onOpenRecipe, labelId }: FieldPickerProps) {
  const [query, setQuery] = useState("")
  const valueId = useId()
  const listId = useId()
  const isSetUp = setUpIn(sources)
  const q = query.trim().toLowerCase()

  const groups = FIELD_GROUPS.map((group) => ({
    group,
    fields: fieldsOfGroup(group).filter((meta) => q === "" || matches(meta.label(level), q) || matches(meta.token, q)),
  })).filter(({ fields }) => fields.length > 0)
  const recipes = onOpenRecipe && q !== "" ? RECIPES.filter((recipe) => matches(recipe.name, q)) : []

  const toggle = () => {
    setQuery("")
    onOpenChange(!open)
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        data-slot="field-trigger"
        data-testid={editorId("field")}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={toggle}
        className="h-10 w-full justify-between border-input bg-background px-3 font-normal md:h-9"
      >
        <span id={valueId} className="truncate">
          {anyFieldMeta(field).label(level)}
        </span>
        <Icon icon={ChevronsUpDown} className="text-muted-foreground" />
      </Button>
      {open && (
        <div id={listId} className="overflow-hidden rounded-md border border-border-strong">
          <Command label="Find a field" shouldFilter={false} loop defaultValue={field}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Find a field"
              data-testid={editorId("field-search")}
              className="h-full"
            />
            <CommandList className="max-h-[min(40dvh,18rem)]">
              <CommandEmpty>No field has that name.</CommandEmpty>
              {groups.map(({ group, fields }) => (
                <CommandGroup key={group} heading={FIELD_GROUP_LABELS[group]}>
                  {fields.map((meta) => {
                    const reason = fieldDisabledReason(meta.id, level, isSetUp)
                    return (
                      <CommandItem
                        key={meta.id}
                        value={meta.id}
                        disabled={reason !== null}
                        onSelect={() => onChoose(meta.id)}
                        data-testid={editorId(`field-option-${kebab(meta.id)}`)}
                        className="items-start py-1.5"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className={cn(meta.id === field && "font-medium")}>{meta.label(level)}</span>
                          <span className="text-caption text-muted-foreground">{reason ?? meta.help}</span>
                        </span>
                        {meta.id === field && <Icon icon={Check} className="mt-0.5" />}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              ))}
              {recipes.length > 0 && (
                <CommandGroup heading="Other matches">
                  {recipes.map((recipe) => (
                    <CommandItem
                      key={recipe.id}
                      value={`recipe-${recipe.id}`}
                      onSelect={() => onOpenRecipe?.(recipe.id)}
                      data-testid={editorId(`recipe-${recipe.id}`)}
                    >
                      {recipe.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  )
}
