import { getAdminSettings } from "@/actions/admin"
import { ChatProvider } from "@/components/admin/chatbot/chat-context"
import { AdminLayoutShell } from "@/components/admin/shared/admin-layout-shell"
import { UnauthenticatedError } from "@/components/admin/shared/unauthenticated-error"
import { UnauthorizedError } from "@/components/admin/shared/unauthorized-error"
import { getAdminGate } from "@/lib/admin"
import React from "react"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Rendered here, not thrown: an error.tsx does not wrap its own segment's
  // layout, and a production build hides a thrown error's name (BP-27).
  const gate = await getAdminGate()
  if (!gate.ok) {
    return gate.reason === "unauthenticated" ? <UnauthenticatedError /> : <UnauthorizedError />
  }
  const { session } = gate
  const settings = await getAdminSettings()
  const hasChatLLM = !!settings.chatLLMProvider

  return (
    <ChatProvider>
      <AdminLayoutShell hasChatLLM={hasChatLLM} chatUserName={session.user.name || undefined}>
        {children}
      </AdminLayoutShell>
    </ChatProvider>
  )
}
