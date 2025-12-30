"use client"

import { generateAllPlexWrapped } from "@/actions/users"
import { useToast } from "@/components/ui/sonner"
import Link from "next/link"
import { useState } from "react"

export function UserManagement() {
  const toast = useToast()
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerateAllWrapped = async () => {
    setIsGenerating(true)
    try {
      const currentYear = new Date().getFullYear()
      const result = await generateAllPlexWrapped(currentYear)
      if (result.success) {
        const message = `Generation complete! Generated: ${result.generated}, Failed: ${result.failed}`
        if (result.errors.length > 0) {
          toast.showError(`${message}. ${result.errors.length} error(s) occurred.`, 8000)
          result.errors.forEach((error) => {
            toast.showError(error, 6000)
          })
        } else {
          toast.showSuccess(message, 5000)
        }
      } else {
        toast.showError("Failed to generate wrapped", 5000)
      }
    } catch (error) {
      toast.showError(error instanceof Error ? error.message : "Failed to generate wrapped", 5000)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* User Info */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">User Management</h2>
        <p className="text-sm text-slate-400 mb-4">
          Users are automatically created when they sign in with their Plex account. View all users
          in the{" "}
          <Link href="/admin/users" className="text-cyan-400 hover:text-cyan-300 underline">
            user list
          </Link>
          .
        </p>
      </div>

      {/* Wrapped Generation */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Bulk Wrapped Generation</h2>
        <p className="text-sm text-slate-400 mb-4">
          Generate Plex Wrapped for all users who have signed in. This will create wrapped reports
          for the current year. Users can also generate their own wrapped from the homepage.
        </p>
        <button
          onClick={handleGenerateAllWrapped}
          disabled={isGenerating}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {isGenerating ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Generating wrapped...
            </>
          ) : (
            "Generate All Wrapped"
          )}
        </button>
      </div>
    </div>
  )
}

