"use client"

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"
import { Check, ChevronsUpDown, X } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { Icon } from "@/components/ui/icon"
import { fieldSurface } from "@/components/ui/input"
import { usePopupLayer, usePortalContainer } from "@/components/ui/portal-container"
import { cn } from "@/lib/utils"

/** A heading in the list and the items under it, such as "Special" and "Members who made requests". */
export interface ComboboxGroup<T> {
  label: string
  items: readonly T[]
}

/** A flat list, or the same items in groups. */
type ComboboxSource<T> = { items: readonly T[]; groups?: never } | { groups: readonly ComboboxGroup<T>[]; items?: never }

export type ComboboxProps<T> = ComboboxSource<T> & {
  /** The chosen items; at most one without `multiple`. */
  value: T[]
  onValueChange: (value: T[]) => void
  /** Several choices shown as chips with remove buttons; true by default. */
  multiple?: boolean
  /** The words that show, filter and name an item. */
  getLabel: (item: T) => string
  /** A stable key: it compares items and makes the test ids. */
  getKey: (item: T) => string
  /** A richer row, such as an avatar and a request count; `getLabel` by default. */
  renderItem?: (item: T) => ReactNode
  placeholder?: string
  /** The line an empty list shows; "Nothing found" by default. */
  emptyText?: string
  disabled?: boolean
  invalid?: boolean
  "aria-label": string
  "aria-describedby"?: string
  className?: string
  /** On the input; options take `{testid}-option-{key}`, chips `{testid}-chip-{key}` and `{testid}-chip-{key}-remove`. */
  "data-testid": string
}

const groupSurface = cn(
  fieldSurface,
  "flex min-h-10 cursor-text flex-wrap items-center gap-1 px-1.5 py-1 md:min-h-9",
  "has-[input:focus-visible]:border-ring has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring",
  "has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-border has-[input:disabled]:bg-muted"
)

const inputClass = cn(
  "h-7 min-w-16 flex-1 bg-transparent px-1.5 text-base text-foreground outline-none placeholder:text-muted-foreground md:text-ui",
  "disabled:cursor-not-allowed disabled:text-muted-foreground"
)

/**
 * A filterable list on Base UI Combobox (UX 4.12.7, TS 12.4), for members,
 * tags and collections: an editable combobox with `aria-activedescendant`,
 * where Up, Down and Enter move and choose. With `multiple`, each choice is a
 * chip with a named remove button, and Backspace in the empty input removes
 * the last one. The list can hold groups with headings. The field picker uses
 * `Command` instead.
 */
export function Combobox<T>({
  items,
  groups,
  value,
  onValueChange,
  multiple = true,
  getLabel,
  getKey,
  renderItem,
  placeholder,
  emptyText = "Nothing found",
  disabled,
  invalid,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  className,
  "data-testid": testId,
}: ComboboxProps<T>) {
  const { container, popupProps } = usePortalContainer()
  const layer = usePopupLayer()
  const { className: popupClassName, ...popupAttributes } = popupProps

  // One list per source, so Base UI keeps its highlight and filter across renders.
  const list = useMemo(
    () => (groups ? groups.map((group) => ({ label: group.label, items: [...group.items] })) : [...(items ?? [])]),
    [groups, items]
  )
  const shared = {
    items: list,
    itemToStringLabel: getLabel,
    isItemEqualToValue: (a: T, b: T) => getKey(a) === getKey(b),
    disabled,
  }

  const input = (
    <ComboboxPrimitive.Input
      data-testid={testId}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      placeholder={multiple && value.length > 0 ? undefined : placeholder}
      className={inputClass}
    />
  )

  const option = (item: T) => (
    <ComboboxPrimitive.Item
      key={getKey(item)}
      value={item}
      data-testid={`${testId}-option-${getKey(item)}`}
      className={cn(
        "flex min-h-8 cursor-default items-center gap-2 rounded-sm px-2 py-1 text-ui text-foreground outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        "data-disabled:cursor-not-allowed data-disabled:text-muted-foreground"
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{renderItem ? renderItem(item) : getLabel(item)}</span>
      <ComboboxPrimitive.ItemIndicator className="flex">
        <Icon icon={Check} />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )

  const popup = (
    <ComboboxPrimitive.Portal container={container}>
      <ComboboxPrimitive.Positioner className={cn("outline-none", layer)} side="bottom" align="start" sideOffset={4}>
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          {...popupAttributes}
          className={cn(
            "max-h-[min(var(--available-height),24rem)] w-(--anchor-width) max-w-(--available-width) overflow-y-auto overscroll-contain",
            "rounded-lg border border-border-strong bg-popover p-1 text-popover-foreground shadow-popover outline-none",
            "origin-(--transform-origin) transition-[opacity,scale] duration-(--duration-fast) ease-(--ease-out-quiet)",
            "data-starting-style:scale-98 data-starting-style:opacity-0 data-ending-style:scale-98 data-ending-style:opacity-0",
            popupClassName
          )}
        >
          <ComboboxPrimitive.Empty className="px-2 py-3 text-ui text-muted-foreground empty:hidden">{emptyText}</ComboboxPrimitive.Empty>
          <ComboboxPrimitive.List data-slot="combobox-list">
            {groups
              ? (group: { label: string; items: T[] }) => (
                  <ComboboxPrimitive.Group key={group.label} items={group.items} className="py-0.5">
                    <ComboboxPrimitive.GroupLabel className="px-2 pt-1.5 pb-1 text-caption text-muted-foreground">
                      {group.label}
                    </ComboboxPrimitive.GroupLabel>
                    <ComboboxPrimitive.Collection>{(item: T) => option(item)}</ComboboxPrimitive.Collection>
                  </ComboboxPrimitive.Group>
                )
              : (item: T) => option(item)}
          </ComboboxPrimitive.List>
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )

  if (!multiple) {
    return (
      <ComboboxPrimitive.Root<T>
        {...shared}
        value={value[0] ?? null}
        onValueChange={(next) => onValueChange(next === null ? [] : [next])}
      >
        <ComboboxPrimitive.InputGroup data-slot="combobox" className={cn(groupSurface, invalid && "border-destructive", className)}>
          {input}
          <ComboboxPrimitive.Icon className="flex px-1.5 text-muted-foreground">
            <Icon icon={ChevronsUpDown} />
          </ComboboxPrimitive.Icon>
        </ComboboxPrimitive.InputGroup>
        {popup}
      </ComboboxPrimitive.Root>
    )
  }

  return (
    <ComboboxPrimitive.Root<T, true> {...shared} multiple value={value} onValueChange={(next) => onValueChange([...next])}>
      <ComboboxPrimitive.InputGroup data-slot="combobox" className={cn(groupSurface, invalid && "border-destructive", className)}>
        <ComboboxPrimitive.Chips className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {value.map((item) => (
            <ComboboxPrimitive.Chip
              key={getKey(item)}
              data-testid={`${testId}-chip-${getKey(item)}`}
              className={cn(
                "flex h-7 max-w-full cursor-default items-center gap-1 rounded-sm border border-border bg-secondary pr-0.5 pl-2 text-label text-secondary-foreground outline-none",
                "focus-within:border-ring data-highlighted:border-ring"
              )}
            >
              <span className="truncate">{getLabel(item)}</span>
              <ComboboxPrimitive.ChipRemove
                aria-label={`Remove ${getLabel(item)}`}
                data-testid={`${testId}-chip-${getKey(item)}-remove`}
                className="flex size-6 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <Icon icon={X} size={14} />
              </ComboboxPrimitive.ChipRemove>
            </ComboboxPrimitive.Chip>
          ))}
          {input}
        </ComboboxPrimitive.Chips>
      </ComboboxPrimitive.InputGroup>
      {popup}
    </ComboboxPrimitive.Root>
  )
}
