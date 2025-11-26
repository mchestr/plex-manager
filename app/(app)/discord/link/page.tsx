import { DiscordLinkPanel } from "@/components/discord/link-panel"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import Link from "next/link"
import { redirect } from "next/navigation"

interface DiscordLinkPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export const dynamic = 'force-dynamic'

export default async function DiscordLinkPage({ searchParams }: DiscordLinkPageProps) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect("/")
  }

  const [integration, connection, params] = await Promise.all([
    prisma.discordIntegration.findUnique({ where: { id: "discord" } }),
    prisma.discordConnection.findUnique({ where: { userId: session.user.id } }),
    searchParams,
  ])

  const statusParam = typeof params?.status === "string" ? params?.status : undefined
  const errorParam = typeof params?.error === "string" ? params?.error : undefined

  let statusMessage: string | undefined
  let errorMessage: string | undefined
  if (statusParam === "linked") {
    statusMessage = "Discord account linked successfully."
  } else if (statusParam === "disconnected") {
    statusMessage = "Discord account disconnected."
  } else if (statusParam === "disabled") {
    statusMessage = "Discord linking is currently disabled."
  } else if (errorParam) {
    // Decode and format error messages from Discord
    const decodedError = decodeURIComponent(errorParam)
    // Extract the actual error description if available
    const errorDesc = params?.error_description as string | undefined
    errorMessage = errorDesc ? decodeURIComponent(errorDesc) : decodedError
  }

  const connectionSummary = connection
    ? {
        username: connection.username,
        discriminator: connection.discriminator,
        globalName: connection.globalName,
        linkedAt: connection.linkedAt.toISOString(),
        metadataSyncedAt: connection.metadataSyncedAt?.toISOString() ?? null,
        lastError: connection.lastError,
      }
    : null

  const redirectParam = typeof params?.redirect === "string" ? params.redirect : undefined
  const redirectTo = redirectParam && redirectParam.startsWith("/") ? redirectParam : undefined
  const fallbackRedirect = "/discord/link"
  const redirectTarget = redirectTo ?? fallbackRedirect
  const connectUrl = `/discord/connect?redirect=${encodeURIComponent(redirectTarget)}`
  const isEnabled = Boolean(integration?.isEnabled && integration?.clientId && integration?.clientSecret)
  const isLinked = Boolean(connectionSummary)

  const heroHighlights = [
    { title: "Priority responses", description: "Reach moderators faster with verified support threads." },
    { title: "Account sync", description: "Roles stay in sync with your Plex membership automatically." },
    { title: "Metadata bridging", description: "Server metadata updates in Discord every time you resync." },
    { title: "One-tap recovery", description: "Lose access? Relink in seconds without contacting staff." },
  ]

  const statusPill = !isEnabled
    ? { label: "Offline", classes: "text-rose-300 bg-rose-500/10 border border-rose-500/40" }
    : isLinked
      ? { label: "Linked", classes: "text-emerald-300 bg-emerald-500/10 border border-emerald-500/40" }
      : { label: "Ready to link", classes: "text-cyan-300 bg-cyan-500/10 border border-cyan-500/40" }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div className="absolute inset-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.25),_transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(147,51,234,0.15),_transparent_55%)]" />
      </div>

      <div className="relative z-10 px-6 py-16 sm:px-10 lg:px-14">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 lg:flex-row">
          <section className="lg:w-[40%]">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 backdrop-blur-xl shadow-2xl shadow-indigo-950/40 space-y-6">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                <span aria-hidden="true">←</span> Back to dashboard
              </Link>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Discord</span>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusPill.classes}`}>{statusPill.label}</span>
              </div>

              <div>
                <h1 className="text-4xl font-semibold text-white">Private support access</h1>
                <p className="mt-3 text-base text-slate-300">
                  Link Plex to Discord to unlock Linked Roles, DM the support bot, and stay verified across every automation.
                </p>
              </div>

              {connectionSummary ? (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-100 space-y-1">
                  <p className="font-semibold text-white">
                    Connected as {connectionSummary.globalName || connectionSummary.username}
                    {connectionSummary.discriminator ? `#${connectionSummary.discriminator}` : ""}
                  </p>
                  <p className="text-slate-300">
                    Linked {connectionSummary.linkedAt ? new Date(connectionSummary.linkedAt).toLocaleString() : "recently"}
                  </p>
                  <p className="text-slate-300">
                    Last sync {connectionSummary.metadataSyncedAt ? new Date(connectionSummary.metadataSyncedAt).toLocaleString() : "pending"}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                  <p className="font-medium text-white">Not linked yet</p>
                  <p className="text-slate-300">Use the panel to the right to open the Discord Linked Roles flow.</p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {heroHighlights.map((highlight) => (
                  <div key={highlight.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">{highlight.title}</p>
                    <p className="mt-1 text-xs text-slate-300">{highlight.description}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href={connectUrl}
                  className={`inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition-all ${
                    isEnabled
                      ? "bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500 text-white shadow-lg shadow-purple-900/30 hover:scale-[1.01]"
                      : "cursor-not-allowed bg-slate-800/80 text-slate-500"
                  }`}
                >
                  {isLinked ? "Relink Discord" : "Start Discord linking"}
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-white/30 hover:text-white"
                >
                  Return home
                </Link>
              </div>
            </div>
          </section>

          <section className="flex-1">
            <DiscordLinkPanel
              connection={connectionSummary}
              instructions={integration?.instructions ?? null}
              connectUrl={connectUrl}
              isEnabled={isEnabled}
              status={statusMessage}
              error={errorMessage}
            />
          </section>
        </div>
      </div>
    </div>
  )
}

