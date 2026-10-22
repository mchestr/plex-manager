"use client"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import type { ReactNode } from "react"

import { Icon } from "@/components/ui/icon"
import { usePopupLayer, usePortalContainer } from "@/components/ui/portal-container"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/**
 * The shared popup surface for menus and popovers (ui-design-system 5.4):
 * popover colours, a strong border, the popover shadow, and a 4px fade-in
 * from the trigger side.
 */
export const popupSurface = cn(
  "origin-(--transform-origin) rounded-lg border border-border-strong bg-popover text-popover-foreground shadow-popover outline-none",
  "transition-[opacity,translate] duration-(--duration-base) ease-(--ease-out-quiet)",
  "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-(--duration-fast)",
  "data-[side=bottom]:data-starting-style:-translate-y-1 data-[side=top]:data-starting-style:translate-y-1",
  "data-[side=left]:data-starting-style:translate-x-1 data-[side=right]:data-starting-style:-translate-x-1"
)

/** An action menu on Base UI Menu: arrow keys, Home and End, typeahead and Escape. */
export function DropdownMenu(props: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root {...props} />
}

export function DropdownMenuTrigger(props: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

type ContentProps = Omit<MenuPrimitive.Popup.Props, "className"> &
  Pick<MenuPrimitive.Positioner.Props, "align" | "side" | "sideOffset"> & { className?: string }

export function DropdownMenuContent({ align = "start", side = "bottom", sideOffset = 4, className, ...props }: ContentProps) {
  const { container, popupProps } = usePortalContainer()
  const layer = usePopupLayer()
  return (
    <MenuPrimitive.Portal container={container}>
      <MenuPrimitive.Positioner className={cn(layer, "outline-none")} align={align} side={side} sideOffset={sideOffset}>
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          {...popupProps}
          className={cn(popupSurface, "max-h-(--available-height) min-w-48 overflow-y-auto p-1", popupProps?.className, className)}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

export function DropdownMenuGroup(props: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

/** The header naming the entity the menu acts on ("Jordan Smith"); sits inside a DropdownMenuGroup. */
export function DropdownMenuLabel({ className, ...props }: Omit<MenuPrimitive.GroupLabel.Props, "className"> & { className?: string }) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      className={cn("truncate px-2 py-1.5 text-label text-muted-foreground", className)}
      {...props}
    />
  )
}

interface ItemProps extends Omit<MenuPrimitive.Item.Props, "className"> {
  className?: string
  /** A 16px lucide glyph before the label. */
  icon?: ReactNode
  /** End a destructive item's label with "..." when it opens a confirm. */
  variant?: "default" | "destructive"
}

export function DropdownMenuItem({ className, icon, variant = "default", children, ...props }: ItemProps) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-ui outline-none select-none",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:text-muted-foreground",
        variant === "destructive" &&
          "text-destructive data-highlighted:bg-destructive-subtle data-highlighted:text-destructive [&_svg]:text-destructive",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </MenuPrimitive.Item>
  )
}

interface LinkItemProps extends Omit<MenuPrimitive.LinkItem.Props, "className"> {
  className?: string
  /** A 16px lucide glyph before the label. */
  icon?: ReactNode
}

/**
 * A menu item that navigates: an `<a>`, so it keeps the link's semantics.
 * Pass `render={<Link href="/x" />}` for an app route. Choosing it closes the menu.
 */
export function DropdownMenuLinkItem({ className, icon, children, ...props }: LinkItemProps) {
  return (
    <MenuPrimitive.LinkItem
      data-slot="dropdown-menu-item"
      closeOnClick
      className={cn(
        "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-ui outline-none select-none",
        "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        className
      )}
      {...props}
    >
      {icon}
      {children}
    </MenuPrimitive.LinkItem>
  )
}

/** A set of `DropdownMenuRadioItem`s, one of them checked (`menuitemradio`). */
export function DropdownMenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

interface RadioItemProps extends Omit<MenuPrimitive.RadioItem.Props, "className"> {
  className?: string
}

/** One choice in a DropdownMenuRadioGroup, with a check after the label when it is the current one. */
export function DropdownMenuRadioItem({ className, children, ...props }: RadioItemProps) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-ui outline-none select-none",
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:text-muted-foreground",
        className
      )}
      {...props}
    >
      <span className="flex-1">{children}</span>
      <MenuPrimitive.RadioItemIndicator className="flex size-4 items-center justify-center">
        <Icon icon={icons.done} />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  )
}

export function DropdownMenuSeparator({ className, ...props }: Omit<MenuPrimitive.Separator.Props, "className"> & { className?: string }) {
  return <MenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />
}
