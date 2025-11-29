"use client"

import { getUserPlexWrapped } from "@/actions/users"
import { WrappedGeneratingAnimation } from "@/components/generator/wrapped-generating-animation"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

interface WrappedPageClientProps {
  userId: string
  year: number
  initialStatus: string
}

export function WrappedPageClient({ userId, year, initialStatus }: WrappedPageClientProps) {
  const toast = useToast()
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const pollFailureCountRef = useRef(0)

  useEffect(() => {
    if (status !== "generating") {
      return
    }

    const pollInterval = setInterval(async () => {
      try {
        const wrappedData = await getUserPlexWrapped(userId, year)
        setStatus(wrappedData?.status || "generating")
        pollFailureCountRef.current = 0 // Reset on success

        if (wrappedData?.status === "completed") {
          clearInterval(pollInterval)
          // Refresh the page to show the completed wrapped
          router.refresh()
        } else if (wrappedData?.status === "failed") {
          clearInterval(pollInterval)
          // Refresh to show error state
          router.refresh()
        }
      } catch (err) {
        console.error("Error polling wrapped status:", err)
        pollFailureCountRef.current += 1
        // Show toast after 3 consecutive failures
        if (pollFailureCountRef.current === 3) {
          toast.showError("Having trouble checking status. Will keep trying...")
        }
      }
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(pollInterval)
  }, [userId, year, status, router])

  if (status === "generating") {
    return <WrappedGeneratingAnimation year={year} />
  }

  return null
}

