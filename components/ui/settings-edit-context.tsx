"use client"

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react"

/** A request to open a section for editing. */
export interface EditRequest {
  id: string
  /** A selector inside the section's form for the control to focus; the first field when left out. */
  focus?: string
  /** Grows with every request, so asking again focuses again. */
  n: number
}

interface SettingsEditContextValue {
  /** The section open for editing, if any. Only one at a time (Primer, "Saving"). */
  editingId: string | null
  request: EditRequest | null
  requestEdit: (id: string, options?: { focus?: string }) => void
  endEdit: (id: string) => void
  reportDirty: (id: string, dirty: boolean) => void
}

const SettingsEditContext = createContext<SettingsEditContextValue | null>(null)

/**
 * The settings page's edit state: which section is open for editing, and
 * each section's dirty flag for the section nav's "Unsaved changes" pip.
 * Opening a section closes the one open before it; a section with unsaved
 * changes stays open until it is saved or its changes are discarded, so
 * nothing typed is ever thrown away without asking.
 */
export function SettingsEditProvider({ onDirtyChange, children }: { onDirtyChange: (id: string, dirty: boolean) => void; children: ReactNode }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [request, setRequest] = useState<EditRequest | null>(null)

  const requestEdit = useCallback((id: string, options?: { focus?: string }) => {
    setEditingId(id)
    setRequest((prev) => ({ id, focus: options?.focus, n: (prev?.n ?? 0) + 1 }))
  }, [])

  const endEdit = useCallback((id: string) => setEditingId((prev) => (prev === id ? null : prev)), [])

  const value = useMemo(
    () => ({ editingId, request, requestEdit, endEdit, reportDirty: onDirtyChange }),
    [editingId, request, requestEdit, endEdit, onDirtyChange]
  )

  return <SettingsEditContext.Provider value={value}>{children}</SettingsEditContext.Provider>
}

/** Opens a section for editing from elsewhere on the page, such as Rewind's "Change the server time zone". Null outside the settings page. */
export function useSettingsEdit() {
  return useContext(SettingsEditContext)?.requestEdit ?? null
}

/** One section's mode: from the page's provider, or its own state when it stands alone. */
export function useSectionEditing(id: string) {
  const context = useContext(SettingsEditContext)
  const [local, setLocal] = useState<{ editing: boolean; request: EditRequest | null }>({ editing: false, request: null })

  if (context) {
    return {
      editing: context.editingId === id,
      request: context.request?.id === id ? context.request : null,
      requestEdit: (options?: { focus?: string }) => context.requestEdit(id, options),
      endEdit: () => context.endEdit(id),
      reportDirty: context.reportDirty,
    }
  }
  return {
    editing: local.editing,
    request: local.request,
    requestEdit: (options?: { focus?: string }) =>
      setLocal((prev) => ({ editing: true, request: { id, focus: options?.focus, n: (prev.request?.n ?? 0) + 1 } })),
    endEdit: () => setLocal((prev) => ({ ...prev, editing: false })),
    reportDirty: undefined,
  }
}
