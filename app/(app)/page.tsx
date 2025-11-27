import { PlexSignInButton } from "@/components/auth/plex-sign-in-button";
import { UserDashboard } from "@/components/dashboard/user-dashboard";
import { AdminFooter } from "@/components/shared/admin-footer";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getServerSession(authOptions);
  const [plexServer, discordIntegration] = await Promise.all([
    prisma.plexServer.findFirst({
      where: { isActive: true },
    }),
    prisma.discordIntegration.findUnique({ where: { id: "discord" } }),
  ]);
  const serverName = plexServer?.name || "Plex";
  const heroTitle = serverName;
  const discordEnabled = Boolean(discordIntegration?.isEnabled && discordIntegration?.clientId && discordIntegration?.clientSecret);

  // Handle redirect logic for authenticated users
  if (session?.user?.id) {
    const userPromise = prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingCompleted: true }
    });
    const discordConnectionPromise = discordEnabled
      ? prisma.discordConnection.findUnique({ where: { userId: session.user.id } })
      : Promise.resolve(null);

    const [user, discordConnection] = await Promise.all([userPromise, discordConnectionPromise]);

    if (user && !user.onboardingCompleted) {
      redirect("/onboarding");
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
        userName={session.user.name || "User"}
        serverName={serverName}
        isAdmin={session.user.isAdmin}
        discordEnabled={discordEnabled}
        discordConnection={discordConnectionSummary}
        serverInviteCode={discordIntegration?.serverInviteCode ?? null}
      />
    );
  }

  const publicHighlights = [
    "Streamlined Plex access & device management",
    "Direct line to the Discord support bot",
    "Automated Linked Roles verification",
    "Plex Wrapped when yearly stats are enabled",
  ];

  return (
    <>
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 md:p-12 lg:p-24 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 pb-20 md:pb-24">
        <div className="z-10 w-full max-w-4xl space-y-10 text-center">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500">Member portal</p>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {heroTitle} access & support
            </h1>
            <p className="text-base text-slate-300 px-6">
              Everything you need to stay verified, manage devices, and reach moderators for the private {serverName} server—all in one place.
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-10 shadow-2xl shadow-black/40 ring-1 ring-white/10 backdrop-blur">
            <div className="flex flex-col items-center gap-6">
              <PlexSignInButton
                serverName={serverName}
                showWarning={true}
                warningDelay={3000}
                showDisclaimer={true}
                buttonText="Sign in with Plex"
                loadingText="Preparing..."
                buttonClassName="px-12 py-6 flex justify-center items-center gap-3 text-white text-xl font-semibold rounded-xl bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
              />
              <div className="w-full grid gap-3 text-left text-sm text-slate-300 sm:grid-cols-2">
                {publicHighlights.map((highlight) => (
                  <div
                    key={highlight}
                    className="flex items-start gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <span className="mt-0.5 h-2 w-2 rounded-full bg-cyan-400" aria-hidden="true" />
                    <p>{highlight}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
      <AdminFooter />
    </>
  );
}

