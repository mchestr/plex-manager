import { checkUserServerAccess, getPlexUserInfo } from "@/lib/connections/plex"
import { prisma } from "@/lib/prisma"
import { getActivePlexService } from "@/lib/services/service-helpers"
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
          process.env.NEXT_PUBLIC_ENABLE_TEST_AUTH === 'true' ||
          process.env.ENABLE_TEST_AUTH === 'true'

        if (isTestMode && credentials?.authToken) {
          console.log('[AUTH] Test mode active, checking test token:', credentials.authToken)
          console.log('[AUTH] NODE_ENV:', process.env.NODE_ENV)
          console.log('[AUTH] NEXT_PUBLIC_ENABLE_TEST_AUTH:', process.env.NEXT_PUBLIC_ENABLE_TEST_AUTH)
          console.log('[AUTH] ENABLE_TEST_AUTH:', process.env.ENABLE_TEST_AUTH)

          if (credentials.authToken === 'TEST_ADMIN_TOKEN') {
             // Return the seeded admin user
             console.log('[AUTH] Looking up admin test user')
             try {
               const adminUser = await prisma.user.findUnique({
                 where: { email: 'admin@example.com' }
               })
               console.log('[AUTH] Admin user lookup result:', adminUser ? { id: adminUser.id, email: adminUser.email, isAdmin: adminUser.isAdmin } : 'not found')

               if (adminUser && adminUser.isAdmin) {
                 console.log('[AUTH] Admin test user found:', adminUser.email)
                 const userData = {
                   id: adminUser.id,
                   email: adminUser.email,
                   name: adminUser.name,
                   image: adminUser.image,
                   isAdmin: true,
                 }
                 console.log('[AUTH] Returning user data:', userData)
                 return userData
               } else {
                 console.error('[AUTH] Admin test user not found or not admin. User:', adminUser)
                 return null
               }
             } catch (error) {
               console.error('[AUTH] Error looking up admin user:', error)
               return null
             }
          }

          if (credentials.authToken === 'TEST_REGULAR_TOKEN') {
             // Return the seeded regular user
             console.log('[AUTH] Looking up regular test user')
             try {
               const regularUser = await prisma.user.findUnique({
                 where: { email: 'regular@example.com' }
               })
               console.log('[AUTH] Regular user lookup result:', regularUser ? { id: regularUser.id, email: regularUser.email, isAdmin: regularUser.isAdmin } : 'not found')

               if (regularUser) {
                 console.log('[AUTH] Regular test user found:', regularUser.email)
                 const userData = {
                   id: regularUser.id,
                   email: regularUser.email,
                   name: regularUser.name,
                   image: regularUser.image,
                   isAdmin: regularUser.isAdmin,
                 }
                 console.log('[AUTH] Returning user data:', userData)
                 return userData
               } else {
                 console.error('[AUTH] Regular test user not found')
                 return null
               }
             } catch (error) {
               console.error('[AUTH] Error looking up regular user:', error)
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

          // Get the configured Plex service
          const plexService = await getActivePlexService()

          if (!plexService) {
            logger.error("No active Plex server configured")
            throw new Error("NO_SERVER_CONFIGURED")
          }

          // Check if user has access to the configured Plex server
          // Use the server's admin token to check if the user exists in the server's user list
          // Also check if the user is the admin (admin users may not be in the user list)
          const accessCheck = await checkUserServerAccess(
            {
              url: plexService.url ?? "",
              token: plexService.config.token,
              adminPlexUserId: plexService.config.adminPlexUserId ?? null,
            },
            plexUser.id
          )

          if (!accessCheck.success || !accessCheck.hasAccess) {
            logger.warn("Plex user denied access", {
              plexUserId: plexUser.id,
              username: plexUser.username,
              // Email is automatically sanitized by logger in production
              serverUrl: plexService.url,
              reason: accessCheck.error || "No access to server",
            })
            throw new Error("ACCESS_DENIED")
          }

          // Check if this user is the admin by comparing Plex user IDs
          const isAdmin = plexService.config.adminPlexUserId === plexUser.id

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
      } else {
        console.warn(`[AUTH] Session callback - missing token.sub or session.user: hasTokenSub=${!!token.sub} hasSessionUser=${!!session.user}`)
      }
      return session
    },
    async jwt({ token, user }) {
      if (user) {
        console.log('[AUTH] JWT callback - user:', { id: user.id, email: user.email, isAdmin: (user as any).isAdmin })
        // Store user info in JWT when user first signs in
        token.sub = user.id
        token.name = user.name
        token.email = user.email
        token.picture = user.image
        token.isAdmin = (user as any).isAdmin || false
        console.log('[AUTH] JWT callback - token updated:', { sub: token.sub, email: token.email, isAdmin: token.isAdmin })
      }
      return token
    },
  },
}

