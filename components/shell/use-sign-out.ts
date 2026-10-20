"use client"

import { signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useCallback } from "react"

/** Signs out and lands on `/`, the sign-in page; shared by every shell's Sign out. */
export function useSignOut() {
  const router = useRouter()
  return useCallback(async () => {
    await signOut({ redirect: false })
    router.push("/")
    router.refresh()
  }, [router])
}
