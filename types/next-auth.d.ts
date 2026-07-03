import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      isAdmin: boolean
    }
  }

  interface User {
    id: string
    isAdmin: boolean
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    isAdmin: boolean
    /** Epoch ms of the last time isAdmin was refreshed from the database. */
    checkedAt?: number
  }
}

