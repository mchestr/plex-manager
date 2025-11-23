import { checkUserServerAccess, getPlexUserInfo } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"

const logger = createLogger("AUTH")

export const authOptions: NextAuthOptions = {
  // NOTE: PrismaAdapter is not compatible with CredentialsProvider
  // We use JWT strategy instead for Plex authentication
  providers: [
    CredentialsProvider({
      id: "plex",
      name: "Plex",
      credentials: {
        authToken: {
          label: "Plex Auth Token",
          type: "text",
        },
      },
      async authorize(credentials) {
        // TEST MODE BYPASS
        // Only active if explicitly enabled via env var
        const isTestMode =
          process.env.NODE_ENV === 'test' ||
          process.env.NEXT_PUBLIC_ENABLE_TEST_AUTH === 'true'

        if (isTestMode && credentials?.authToken) {
          console.log('[AUTH] Test mode active, checking test token:', credentials.authToken)

          if (credentials.authToken === 'TEST_ADMIN_TOKEN') {
             // Return the seeded admin user
             console.log('[AUTH] Looking up admin test user')
             const adminUser = await prisma.user.findUnique({
               where: { email: 'admin@example.com' }
             })
             if (adminUser && adminUser.isAdmin) {
               console.log('[AUTH] Admin test user found:', adminUser.email)
               return {
                 id: adminUser.id,
                 email: adminUser.email,
                 name: adminUser.name,
                 image: adminUser.image,
                 isAdmin: true,
               }
             } else {
               console.error('[AUTH] Admin test user not found or not admin')
               return null
             }
          }

          if (credentials.authToken === 'TEST_REGULAR_TOKEN') {
             // Return the seeded regular user
             console.log('[AUTH] Looking up regular test user')
             const regularUser = await prisma.user.findUnique({
               where: { email: 'regular@example.com' }
             })
             if (regularUser) {
               console.log('[AUTH] Regular test user found:', regularUser.email)
               return {
                 id: regularUser.id,
                 email: regularUser.email,
                 name: regularUser.name,
                 image: regularUser.image,
                 isAdmin: regularUser.isAdmin,
               }
             } else {
               console.error('[AUTH] Regular test user not found')
               return null
             }
          }

          // If test mode but unrecognized token, fail
          console.error('[AUTH] Test mode active but unrecognized test token:', credentials.authToken)
          return null
        }

        if (!credentials?.authToken) {
          return null
        }

        const { authToken } = credentials

        try {
          // Fetch user info from Plex API
          const userInfoResult = await getPlexUserInfo(authToken)
          if (!userInfoResult.success || !userInfoResult.data) {
            logger.error("Failed to fetch user", undefined, { error: userInfoResult.error })
            return null
          }

          const plexUser = userInfoResult.data

          // Get the configured Plex server
          const plexServer = await prisma.plexServer.findFirst({
            where: { isActive: true },
          })

          if (!plexServer) {
            logger.error("No active Plex server configured")
            throw new Error("NO_SERVER_CONFIGURED")
          }

          // Check if user has access to the configured Plex server
          // Use the server's admin token to check if the user exists in the server's user list
          // Also check if the user is the admin (admin users may not be in the user list)
          const accessCheck = await checkUserServerAccess(
            {
              hostname: plexServer.hostname,
              port: plexServer.port,
              protocol: plexServer.protocol,
              token: plexServer.token,
              adminPlexUserId: plexServer.adminPlexUserId,
            },
            plexUser.id
          )

          if (!accessCheck.success || !accessCheck.hasAccess) {
            logger.warn("Plex user denied access", {
              plexUserId: plexUser.id,
              username: plexUser.username,
              // Email is automatically sanitized by logger in production
              serverHostname: plexServer.hostname,
              reason: accessCheck.error || "No access to server",
            })
            throw new Error("ACCESS_DENIED")
          }

          // Check if this user is the admin by comparing Plex user IDs
          const isAdmin = plexServer.adminPlexUserId === plexUser.id

          // Find or create user
          let dbUser = await prisma.user.findUnique({
            where: { plexUserId: plexUser.id },
          })

          if (!dbUser) {
            // Create new user
            dbUser = await prisma.user.create({
              data: {
                plexUserId: plexUser.id,
                name: plexUser.username,
                email: plexUser.email,
                image: plexUser.thumb,
                isAdmin,
              },
            })

            // Audit log: New user created
            if (isAdmin) {
              const { logAuditEvent, AuditEventType } = await import("@/lib/security/audit-log")
              logAuditEvent(AuditEventType.USER_CREATED, dbUser.id, {
                isAdmin: true,
                plexUserId: plexUser.id,
              })
            }
          } else {
            // Check if admin status changed
            const adminStatusChanged = dbUser.isAdmin !== isAdmin

            // Update existing user info and admin status
            dbUser = await prisma.user.update({
              where: { id: dbUser.id },
              data: {
                name: plexUser.username,
                email: plexUser.email,
                image: plexUser.thumb,
                isAdmin,
              },
            })

            // Audit log: Admin privilege change
            if (adminStatusChanged) {
              const { logAuditEvent, AuditEventType } = await import("@/lib/security/audit-log")
              logAuditEvent(
                isAdmin ? AuditEventType.ADMIN_PRIVILEGE_GRANTED : AuditEventType.ADMIN_PRIVILEGE_REVOKED,
                dbUser.id,
                {
                  targetUserId: dbUser.id,
                  previousAdminStatus: !isAdmin,
                  newAdminStatus: isAdmin,
                  plexUserId: plexUser.id,
                }
              )
            }
          }

          return {
            id: dbUser.id,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image,
            isAdmin: dbUser.isAdmin,
          }
        } catch (error) {
          logger.error("Error authenticating user", error)
          // Re-throw access denied errors so they can be handled specially
          if (error instanceof Error && (error.message === "ACCESS_DENIED" || error.message === "NO_SERVER_CONFIGURED")) {
            throw error
          }
          return null
        }
      },
    }),
  ],
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
        session.user.name = token.name as string
        session.user.email = token.email as string
        session.user.image = token.picture as string
        session.user.isAdmin = token.isAdmin as boolean
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        // Store user info in JWT when user first signs in
        token.sub = user.id
        token.name = user.name
        token.email = user.email
        token.picture = user.image
        token.isAdmin = (user as any).isAdmin || false
      }
      return token
    },
  },
}

