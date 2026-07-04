import { getConfig } from "@/actions/admin"
import { getShareAnalyticsStats } from "@/actions/share-analytics"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getLLMUsageStats } from "@/lib/wrapped/usage"
import { getServerSession } from "next-auth"
import _Link from "next/link"
import { AdminFooterClient } from "@/components/shared/admin-footer-client"
import packageJson from "@/package.json"

export async function AdminFooter() {
  const session = await getServerSession(authOptions)

  // Only show admin panel if user is admin
  if (!session?.user?.isAdmin) {
    return null
  }

  // Fetch token/cost stats, total users, and share stats
  const [stats, totalUsers, shareStats] = await Promise.all([
    getLLMUsageStats(),
    prisma.user.count(),
    getShareAnalyticsStats(),
  ])
  const config = await getConfig()

  return (
    <AdminFooterClient
      session={session}
      stats={stats}
      totalUsers={totalUsers}
      shareStats={shareStats}
      llmDisabled={config.llmDisabled}
      appVersion={packageJson.version}
    />
  )
}

