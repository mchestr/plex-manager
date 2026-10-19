"use client"

import { createContext, useContext, type ReactNode } from "react"

/**
 * Attributes every popup spreads on its popup element. P5.1's Rewind layout
 * passes `{ "data-field": "paper" }`, so popups opened inside the scope print
 * on paper with ink controls.
 */
export type PopupProps = { className?: string } & { [key: `data-${string}`]: string | undefined }

interface PortalContainerValue {
  container?: HTMLElement | null
  popupProps?: PopupProps
}

const PortalContainerContext = createContext<PortalContainerValue>({})

/**
 * Sets where popups (Select, DropdownMenu, Popover, Tooltip, Dialog) portal
 * to, and the attributes they spread on their popup element, for everything
 * below it. P5.1's Rewind layout is its first caller.
 *
 * @public
 */
export function PortalContainerProvider({
  container,
  popupProps,
  children,
}: PortalContainerValue & { children: ReactNode }) {
  return <PortalContainerContext.Provider value={{ container, popupProps }}>{children}</PortalContainerContext.Provider>
}

/**
 * The container every popup passes to its `*.Portal`, and the props it spreads
 * on the popup. The container defaults to `document.body` (undefined while
 * rendering on the server, where nothing portals).
 */
export function usePortalContainer(): { container: HTMLElement | undefined; popupProps: PopupProps } {
  const { container, popupProps } = useContext(PortalContainerContext)
  return {
    container: container ?? (typeof document === "undefined" ? undefined : document.body),
    popupProps: popupProps ?? {},
  }
}

const InModalContext = createContext(false)

/**
 * Marks its subtree as inside a dialog (P3.6's Dialog sets it), so popups
 * stack at `--z-popover-in-modal` above the dialog instead of
 * `--z-dropdown` underneath it.
 *
 * @public
 */
export function InModalProvider({ children }: { children: ReactNode }) {
  return <InModalContext.Provider value>{children}</InModalContext.Provider>
}

/** The stacking class for a popup's positioner. */
export function usePopupLayer(): string {
  return useContext(InModalContext) ? "z-(--z-popover-in-modal)" : "z-(--z-dropdown)"
}
