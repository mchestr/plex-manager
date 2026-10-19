/**
 * @jest-environment node
 */

/**
 * Tests for lib/connections/llm-provider.ts (P2.12, SEC-44): each provider's
 * model-list request, fixed error messages, and keys that never follow a
 * cross-origin redirect.
 */

import { isConnectionTestBypassed } from "@/lib/connections/connection-test"
import { listProviderModels, loadProviderModels, testLLMProviderConnection } from "@/lib/connections/llm-provider"

jest.mock("@/lib/connections/connection-test", () => ({ isConnectionTestBypassed: jest.fn(() => false) }))

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>()
const originalFetch = global.fetch

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

function headersOf(call: number): Record<string, string> {
  return fetchMock.mock.calls[call][1].headers as Record<string, string>
}

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
  ;(isConnectionTestBypassed as jest.Mock).mockReturnValue(false)
})

afterAll(() => {
  global.fetch = originalFetch
})

describe("listProviderModels", () => {
  it("lists OpenAI models with a bearer key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: "gpt-6-sol" }, { id: "gpt-4o" }] }))

    const result = await listProviderModels({ provider: "openai", apiKey: "sk-1" })

    expect(result).toEqual({ ok: true, data: ["gpt-4o", "gpt-6-sol"] })
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.openai.com/v1/models")
    expect(headersOf(0)).toMatchObject({ Authorization: "Bearer sk-1" })
  })

  it("lists Anthropic models with x-api-key and the API version", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: "claude-sonnet-5-5", type: "model" }], has_more: false }))

    const result = await listProviderModels({ provider: "anthropic", apiKey: "ant-1" })

    expect(result).toEqual({ ok: true, data: ["claude-sonnet-5-5"] })
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.anthropic.com/v1/models?limit=1000")
    expect(headersOf(0)).toMatchObject({ "x-api-key": "ant-1", "anthropic-version": "2023-06-01" })
    expect(headersOf(0)).not.toHaveProperty("Authorization")
  })

  it("lists Google models that generate content, without the models/ prefix", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        models: [
          { name: "models/gemini-4-argon", supportedGenerationMethods: ["generateContent", "countTokens"] },
          { name: "models/text-embedding-9", supportedGenerationMethods: ["embedContent"] },
        ],
      })
    )

    const result = await listProviderModels({ provider: "google", apiKey: "g-1" })

    expect(result).toEqual({ ok: true, data: ["gemini-4-argon"] })
    expect(fetchMock.mock.calls[0][0]).toBe("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000")
    expect(headersOf(0)).toMatchObject({ "x-goog-api-key": "g-1" })
  })

  it("lists an OpenAI-compatible server under its base URL, with no key when none is set", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ object: "list", data: [{ id: "qwen3.6:27b" }] }))

    const result = await listProviderModels({ provider: "openai-compatible", baseUrl: "http://localhost:11434/v1" })

    expect(result).toEqual({ ok: true, data: ["qwen3.6:27b"] })
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:11434/v1/models")
    expect(headersOf(0)).not.toHaveProperty("Authorization")
  })

  it("is INVALID_RESPONSE when the body does not match", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ unexpected: true }))

    expect(await listProviderModels({ provider: "openai", apiKey: "k" })).toEqual({ ok: false, code: "INVALID_RESPONSE" })
  })

  it.each([
    ["openai", "Authorization", { apiKey: "sk-secret" }],
    ["anthropic", "x-api-key", { apiKey: "ant-secret" }],
    ["google", "x-goog-api-key", { apiKey: "g-secret" }],
    ["openai-compatible", "Authorization", { apiKey: "local-secret", baseUrl: "http://llm.lan:8000/v1" }],
  ] as const)("drops the %s key (%s) on a cross-origin redirect", async (provider, header, config) => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://elsewhere.example/models" } }))
      .mockResolvedValueOnce(jsonResponse({ data: [], models: [] }))

    await listProviderModels({ provider, ...config })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe("https://elsewhere.example/models")
    expect(Object.keys(headersOf(1)).map((key) => key.toLowerCase())).not.toContain(header.toLowerCase())
  })
})

describe("loadProviderModels and testLLMProviderConnection", () => {
  it("never echoes an upstream error body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "upstream secret detail sk-live-123" } }, 500))

    const result = await loadProviderModels({ provider: "openai", apiKey: "k" })

    expect(result).toEqual({ success: false, error: "OpenAI returned HTTP 500" })
  })

  it("reports a rejected key as Invalid API key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: "bad key sk-xyz" } }, 401))

    expect(await testLLMProviderConnection({ provider: "anthropic", apiKey: "k", model: "claude-sonnet-5-5" })).toEqual({
      success: false,
      error: "Invalid API key",
    })
  })

  it("passes when the chosen model is listed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{ id: "gpt-6-sol-2026-09-22" }] }))

    expect(await testLLMProviderConnection({ provider: "openai", apiKey: "k", model: "gpt-6-sol" })).toEqual({ success: true })
  })

  it("fails when the chosen model is not listed, unless it was entered as a custom id", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ data: [{ id: "gpt-4o" }] }))

    const listed = await testLLMProviderConnection({ provider: "openai", apiKey: "k", model: "gpt-9" })
    expect(listed.success).toBe(false)
    expect(listed.error).toContain("gpt-9")

    expect(
      await testLLMProviderConnection({ provider: "openai", apiKey: "k", model: "gpt-9" }, { customModel: true })
    ).toEqual({ success: true })
  })

  it("is skipped when connection tests are bypassed", async () => {
    ;(isConnectionTestBypassed as jest.Mock).mockReturnValue(true)

    expect(await testLLMProviderConnection({ provider: "google", apiKey: "k", model: "x" })).toEqual({ success: true })
    expect(await loadProviderModels({ provider: "anthropic", apiKey: "k" })).toEqual({
      success: true,
      models: expect.arrayContaining(["claude-sonnet-5-5"]),
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
