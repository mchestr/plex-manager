/**
 * Tests for API security helper functions
 * Tests authentication and authorization checks for API routes
 */

import { NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { ErrorCode } from "@/lib/security/error-handler"

// Mock Next.js server
jest.mock("next/server", () => ({
  NextRequest: jest.requireActual("next/server").NextRequest,
  NextResponse: {
    json: jest.fn((data, init) => ({
      json: () => Promise.resolve(data),
      status: init?.status || 200,
      ...init,
    })),
  },
}))

// Mock dependencies
jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}))

jest.mock("@/lib/security/error-handler", () => ({
  ...jest.requireActual("@/lib/security/error-handler"),
  logError: jest.fn(),
}))

describe("API Security Helpers", () => {
  const mockAdminSession = {
    user: {
      id: "admin-user-id",
      email: "admin@example.com",
      name: "Admin User",
      isAdmin: true,
    },
  }

  const mockRegularUserSession = {
    user: {
      id: "regular-user-id",
      email: "user@example.com",
      name: "Regular User",
      isAdmin: false,
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("requireAdminAPI", () => {
    it("should allow admin user", async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(mockAdminSession)

      const request = new NextRequest("http://localhost:3000/api/admin/test")
      const result = await requireAdminAPI(request)

      expect(result.session).toEqual(mockAdminSession)
      expect(result.response).toBeNull()
    })

    it("should reject unauthenticated user", async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(null)

      const request = new NextRequest("http://localhost:3000/api/admin/test")
      const result = await requireAdminAPI(request)

      expect(result.session).toBeNull()
      expect(result.response).not.toBeNull()

      const data = await result.response!.json()
      expect(data.code).toBe(ErrorCode.UNAUTHORIZED)
      expect(data.error).toBe("Authentication required")
      expect(result.response!.status).toBe(401)
    })

    it("should reject non-admin user", async () => {
      ;(getServerSession as jest.Mock).mockResolvedValue(mockRegularUserSession)

      const request = new NextRequest("http://localhost:3000/api/admin/test")
      const result = await requireAdminAPI(request)

      expect(result.session).toBeNull()
      expect(result.response).not.toBeNull()

      const data = await result.response!.json()
      expect(data.code).toBe(ErrorCode.FORBIDDEN)
      expect(data.error).toBe("Admin access required")
      expect(result.response!.status).toBe(403)
    })

    it("should handle session check errors gracefully", async () => {
      ;(getServerSession as jest.Mock).mockRejectedValue(
        new Error("Session check failed")
      )

      const request = new NextRequest("http://localhost:3000/api/admin/test")
      const result = await requireAdminAPI(request)

      expect(result.session).toBeNull()
      expect(result.response).not.toBeNull()

      const data = await result.response!.json()
      expect(data.code).toBe(ErrorCode.INTERNAL_ERROR)
      expect(data.error).toBe("Authentication check failed")
      expect(result.response!.status).toBe(500)
    })
  })

})
