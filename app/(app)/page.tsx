import { getActiveAnnouncements } from "@/actions/announcements";
import { getPrometheusStatus } from "@/actions/prometheus-status";
import { getUserFirstWatchDate } from "@/actions/users";
import { PlexSignInButton } from "@/components/auth/plex-sign-in-button";
import { UserDashboard } from "@/components/dashboard/user-dashboard";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getServerSession(authOptions);
  const [plexServer, discordIntegration, announcements, overseerr, prometheusStatus] = await Promise.all([
    prisma.plexServer.findFirst({
      where: { isActive: true },
    }),
    prisma.discordIntegration.findUnique({ where: { id: "discord" } }),
    getActiveAnnouncements(),
    prisma.overseerr.findFirst({ where: { isActive: true } }),
    getPrometheusStatus(),
  ]);
  const serverName = plexServer?.name || "Plex";
  const discordEnabled = Boolean(discordIntegration?.isEnabled && discordIntegration?.clientId && discordIntegration?.clientSecret);
  const overseerrUrl = overseerr?.publicUrl || overseerr?.url || null;

  // Handle redirect logic for authenticated users
  if (session?.user?.id) {
    const userPromise = prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingCompleted: true, createdAt: true, plexUserId: true, email: true }
    });
    const discordConnectionPromise = discordEnabled
      ? prisma.discordConnection.findUnique({ where: { userId: session.user.id } })
      : Promise.resolve(null);

    const [user, discordConnection] = await Promise.all([userPromise, discordConnectionPromise]);

    if (user && !user.onboardingCompleted) {
      redirect("/onboarding");
    }

    // Get first watch date from Tautulli for accurate membership duration
    // Falls back to account creation date if Tautulli is not available or user has no history
    let memberSince = user?.createdAt?.toISOString() ?? new Date().toISOString();
    if (user?.plexUserId) {
      const firstWatchResult = await getUserFirstWatchDate(user.plexUserId, user.email);
      if (firstWatchResult.success && firstWatchResult.firstWatchDate) {
        memberSince = firstWatchResult.firstWatchDate;
      }
    }

    const discordConnectionSummary = discordConnection
      ? {
          username: discordConnection.username,
          discriminator: discordConnection.discriminator,
          globalName: discordConnection.globalName,
          linkedAt: discordConnection.linkedAt ? discordConnection.linkedAt.toISOString() : null,
          metadataSyncedAt: discordConnection.metadataSyncedAt ? discordConnection.metadataSyncedAt.toISOString() : null,
        }
      : null;

    return (
      <UserDashboard
        userId={session.user.id}
        serverName={serverName}
        isAdmin={session.user.isAdmin}
        discordEnabled={discordEnabled}
        discordConnection={discordConnectionSummary}
        serverInviteCode={discordIntegration?.serverInviteCode ?? null}
        announcements={announcements}
        overseerrUrl={overseerrUrl}
        prometheusStatus={prometheusStatus}
        memberSince={memberSince}
      />
    );
  }

  return (
    <main className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="flex flex-col items-center gap-6 sm:gap-8">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent text-center">
          {serverName}
        </h1>
        <PlexSignInButton
          serverName={serverName}
          showWarning={true}
          warningDelay={3000}
          showDisclaimer={false}
          buttonText="Sign in with Plex"
          loadingText="Signing in..."
          buttonClassName="px-6 sm:px-8 py-3 sm:py-4 flex justify-center items-center gap-3 text-white text-base sm:text-lg font-semibold rounded-xl bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
        />
      </div>
    </main>
  );
}

