import { authOptions } from "@/lib/auth"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

export const dynamic = 'force-dynamic'

export default async function DiscordLinkPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect("/")
  }

  // Just redirect to homepage - the callout there is sufficient
  redirect("/")
}

