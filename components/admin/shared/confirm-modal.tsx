"use client"

import { useId } from "react"
import { ModalShell } from "@/components/ui/modal-shell"

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmButtonClass?: string
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmButtonClass = "bg-purple-600 hover:bg-purple-700",
}: ConfirmModalProps) {
  const titleId = useId()
  const descriptionId = useId()

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="md"
      labelledBy={titleId}
      describedBy={descriptionId}
      className="bg-slate-800 overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-700">
        <h3 id={titleId} className="text-xl font-bold text-white leading-tight">{title}</h3>
      </div>

      {/* Body */}
      <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
        <p id={descriptionId} className="text-slate-300 text-sm leading-relaxed overflow-wrap-break-word">{message}</p>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-slate-800/50 border-t border-slate-700 flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-800"
        >
          {cancelText}
        </button>
        <button
          onClick={handleConfirm}
          className={`px-4 py-2 ${confirmButtonClass} text-white text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-800`}
        >
          {confirmText}
        </button>
      </div>
    </ModalShell>
  )
}

