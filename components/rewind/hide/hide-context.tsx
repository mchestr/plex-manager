"use client"

import { createContext, Fragment, useContext, useState, type ReactNode } from "react"

/** A title the member hid, as the Settings sheet lists it. */
export interface HiddenTitle {
  ratingKey: string
  kind: "film" | "series"
  /** Copied at hide time; null for a row made before titles were kept. */
  title: string | null
}

type ExclusionInput = { year: number; ratingKey: string; kind: HiddenTitle["kind"] }
type ExclusionAction = (input: ExclusionInput) => Promise<{ success: true; data: unknown } | { success: false; error: string }>

/** P7.7's server actions, passed in by the issue so the stage stays free of server imports. */
interface HideActions {
  hide: ExclusionAction
  unhide: ExclusionAction
}

/** The issue's hidden titles, the actions that change them, and what watches the regeneration. */
export interface HideSetup {
  hidden: readonly HiddenTitle[]
  actions: HideActions
  /** Mounted anew after each change: the issue's `RegenerationWatch`. */
  watch?: ReactNode
}

interface HideValue {
  hidden: readonly HiddenTitle[]
  isHidden: (ratingKey: string) => boolean
  /** Resolves to an error message, or null once the change holds. */
  hide: (title: HiddenTitle) => Promise<string | null>
  unhide: (title: HiddenTitle) => Promise<string | null>
}

const HideContext = createContext<HideValue | null>(null)

/**
 * Hiding a title (P7.7): the member's hidden titles, kept in step with each
 * hide and unhide so the row sheet and Settings agree before the page
 * refreshes. After each change it mounts `setup.watch` again, which polls the
 * no-LLM regeneration and refreshes the page when it lands.
 */
export function HideProvider({ year, setup, children }: { year: number; setup: HideSetup; children: ReactNode }) {
  const [hidden, setHidden] = useState(setup.hidden)
  const [changes, setChanges] = useState(0)

  const change = async (title: HiddenTitle, hiding: boolean) => {
    const action = hiding ? setup.actions.hide : setup.actions.unhide
    const result = await action({ year, ratingKey: title.ratingKey, kind: title.kind })
    if (!result.success) return result.error
    setHidden((list) => [...list.filter((t) => t.ratingKey !== title.ratingKey), ...(hiding ? [title] : [])])
    setChanges((n) => n + 1)
    return null
  }

  const value: HideValue = {
    hidden,
    isHidden: (ratingKey) => hidden.some((t) => t.ratingKey === ratingKey),
    hide: (title) => change(title, true),
    unhide: (title) => change(title, false),
  }
  return (
    <HideContext.Provider value={value}>
      {children}
      {changes > 0 && <Fragment key={changes}>{setup.watch}</Fragment>}
    </HideContext.Provider>
  )
}

/** The hide controls' state, or null where hiding is unavailable (preview mode, the dev stage). */
export function useHideTitles(): HideValue | null {
  return useContext(HideContext)
}
