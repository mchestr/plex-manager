import { PlexSignInButton } from "@/components/auth/plex-sign-in-button";
import { AdminFooter } from "@/components/shared/admin-footer";
import { WrappedHomeButton } from "@/components/wrapped/wrapped-home-button";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await getServerSession(authOptions);
  const plexServer = await prisma.plexServer.findFirst({
    where: { isActive: true },
  });
  const currentYear = new Date().getFullYear();
  const serverName = plexServer?.name || "Plex";
  const heroTitle = `${serverName} ${currentYear} Wrapped`;

  return (
    <>
      <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 md:p-12 lg:p-24 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 pb-20 md:pb-24">
        <div className="z-10 max-w-5xl w-full flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-6 w-full max-w-2xl mx-auto">
            {session ? (
              <WrappedHomeButton userId={session.user.id} serverName={serverName} />
            ) : (
              <>
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-center mb-6 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent px-4">
                  {heroTitle}
                </h1>
                <PlexSignInButton
                  serverName={serverName}
                  showWarning={true}
                  warningDelay={3000}
                  showDisclaimer={true}
                  buttonText="Sign in with Plex"
                  loadingText="Preparing..."
                  buttonClassName="px-12 py-6 flex justify-center items-center gap-3 text-white text-xl font-semibold rounded-xl bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg"
                />
              </>
            )}
          </div>
        </div>
      </main>
      <AdminFooter />
    </>
  );
}

