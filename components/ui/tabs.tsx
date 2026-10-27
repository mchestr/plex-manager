"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

type WithClassName<P> = Omit<P, "className"> & { className?: string }

/**
 * Tabs on Base UI Tabs (ui-design-system 5.4): a real `role="tablist"`,
 * arrow keys between tabs, and the underline recipe: 40px tabs in 14px/500,
 * inactive `muted-foreground`, active `foreground` with a 2px `ring`
 * underline over the list's 1px `border` baseline.
 *
 * ```tsx
 * <Tabs value={tab} onValueChange={setTab}>
 *   <TabsList aria-label="Model configuration">
 *     <TabsTab value="chat">Admin assistant</TabsTab>
 *     <TabsTab value="wrapped">Rewind generation</TabsTab>
 *   </TabsList>
 *   <TabsPanel value="chat">...</TabsPanel>
 *   <TabsPanel value="wrapped">...</TabsPanel>
 * </Tabs>
 * ```
 *
 * A URL-driven caller (the user detail tabs) renders one `TabsPanel` for the
 * active value, filled on the server.
 */
export function Tabs({ className, ...props }: WithClassName<TabsPrimitive.Root.Props>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-6", className)} {...props} />
}

/**
 * The tab row. `activateOnFocus` is on, so an arrow key selects as it moves.
 * The baseline is an inset shadow rather than a border: `overflow-x-auto`
 * makes the row scroll vertically too, so a tab pulled over a bottom border
 * would overflow it by a pixel and show a scrollbar.
 */
export function TabsList({ className, activateOnFocus = true, ...props }: WithClassName<TabsPrimitive.List.Props>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      activateOnFocus={activateOnFocus}
      className={cn("flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--border)]", className)}
      {...props}
    />
  )
}

export function TabsTab({ className, ...props }: WithClassName<TabsPrimitive.Tab.Props>) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "inline-flex h-10 shrink-0 items-center border-b-2 border-transparent px-3 text-ui font-medium whitespace-nowrap text-muted-foreground outline-none",
        "transition-colors duration-(--duration-fast) ease-(--ease-out-quiet)",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        "data-active:border-ring data-active:text-foreground data-disabled:cursor-not-allowed data-disabled:opacity-60",
        className
      )}
      {...props}
    />
  )
}

export function TabsPanel({ className, ...props }: WithClassName<TabsPrimitive.Panel.Props>) {
  return <TabsPrimitive.Panel data-slot="tabs-panel" className={cn("outline-none", className)} {...props} />
}
