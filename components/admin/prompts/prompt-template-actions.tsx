"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  deletePromptTemplate,
  setActivePromptTemplate,
} from "@/actions/prompts"
import { PromptTemplate } from "@/lib/generated/prisma/client"
import { ConfirmModal } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

interface PromptTemplateActionsProps {
  template: PromptTemplate
}

export function PromptTemplateActions({ template }: PromptTemplateActionsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const handleSetActive = async () => {
    if (!template.isActive) {
      startTransition(async () => {
        const result = await setActivePromptTemplate(template.id)
        if (result.success) {
          router.refresh()
          setError(null)
        } else {
          setError(result.error || "Failed to set active template")
        }
      })
    }
  }

  function handleDeleteClick() {
    setShowDeleteModal(true)
  }

  const handleDeleteConfirm = async () => {
    startTransition(async () => {
      const result = await deletePromptTemplate(template.id)
      if (result.success) {
        router.push("/admin/prompts")
      } else {
        setError(result.error || "Failed to delete template")
      }
      setShowDeleteModal(false)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded text-xs">
          {error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {!template.isActive && (
          <Button
            onClick={handleSetActive}
            disabled={isPending}
            variant="primary"
            size="sm"
          >
            Set Active
          </Button>
        )}
        <Button asChild variant="primary" size="sm">
          <Link href={`/admin/prompts/${template.id}/edit`}>
            Edit
          </Link>
        </Button>
        <Button asChild variant="primary" size="sm">
          <Link href={`/admin/playground?templateId=${template.id}`}>
            Playground
          </Link>
        </Button>
        {!template.isActive && (
          <Button
            onClick={handleDeleteClick}
            disabled={isPending}
            variant="danger"
            size="sm"
          >
            Delete
          </Button>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete Template"
        message="Are you sure you want to delete this template? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </div>
  )
}

