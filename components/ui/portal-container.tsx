"use client"

import { createContext, useContext, useMemo, type ReactNode, type RefObject } from "react"

/**
 * Attributes every popup spreads on its popup element. P5.1's Rewind layout
 * passes `{ "data-field": "paper" }`, so popups opened inside the scope print
 * on paper with ink controls.
 */
export type PopupProps = { className?: string } & { [key: `data-${string}`]: string | undefined }

/** An element, or a ref to one that Base UI reads when the popup mounts. */
type PortalContainer = HTMLElement | RefObject<HTMLElement | null>

interface PortalContainerValue {
  container?: PortalContainer | null
  popupProps?: PopupProps
}

/** One shared empty object, so `useToast()` stays referentially stable outside any provider. */
const NO_POPUP_PROPS: PopupProps = {}

const PortalContainerContext = createContext<PortalContainerValue>({})

/**
 * Sets where popups (Select, DropdownMenu, Popover, Tooltip, Dialog) portal
 * to, and the attributes they spread on their popup element, for everything
 * below it. P5.1's Rewind layout is its first production caller.
 *
 * A layout above a `loading.tsx` passes its root as a ref, not as an element
 * held in state, and keeps `popupProps` stable. While the page below still
 * streams, any change to this context, such as the state update a callback
 * ref makes on hydration, makes React render a second copy of the page
 * beside the hidden streamed one (`components/ui/flash-from-query.tsx`).
 */
export function PortalContainerProvider({
  container,
  popupProps,
  children,
}: PortalContainerValue & { children: ReactNode }) {
  const value = useMemo(() => ({ container, popupProps }), [container, popupProps])
  return <PortalContainerContext.Provider value={value}>{children}</PortalContainerContext.Provider>
}

/**
 * The container every popup passes to its `*.Portal`, and the props it spreads
 * on the popup. The container defaults to `document.body` (undefined while
 * rendering on the server, where nothing portals).
 */
export function usePortalContainer(): { container: PortalContainer | undefined; popupProps: PopupProps } {
  const { container, popupProps } = useContext(PortalContainerContext)
  return {
    container: container ?? (typeof document === "undefined" ? undefined : document.body),
    popupProps: popupProps ?? NO_POPUP_PROPS,
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
