"use client"

import { toggleJellyfinLogin } from "@/actions/admin/admin-servers"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

interface JellyfinLoginToggleProps {
  enabledForLogin: boolean
}

export function JellyfinLoginToggle({ enabledForLogin }: JellyfinLoginToggleProps) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()

  const handleToggle = () => {
    startTransition(async () => {
      const result = await toggleJellyfinLogin(!enabledForLogin)
      if (result.success) {
        toast.showSuccess(
          `Jellyfin login ${!enabledForLogin ? "enabled" : "disabled"} successfully`
        )
        router.refresh()
      } else {
        toast.showError(result.error || "Failed to update Jellyfin login setting")
      }
    })
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-700">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-medium text-slate-300">Login Settings</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            {enabledForLogin
              ? "Jellyfin is visible on the login page"
              : "Jellyfin is hidden from the login page"}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={isPending}
          data-testid="jellyfin-login-toggle"
          className="px-3 py-1 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-600 hover:border-cyan-500/50 text-slate-300 hover:text-white text-xs font-medium rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center whitespace-nowrap"
        >
          {isPending
            ? "Updating..."
            : enabledForLogin
              ? "Hide from Login"
              : "Show on Login"}
        </button>
      </div>
    </div>
  )
}
