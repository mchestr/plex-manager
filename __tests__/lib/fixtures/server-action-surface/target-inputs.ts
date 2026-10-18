"use server"

/**
 * Fixture for __tests__/lib/server-action-surface.test.ts, never imported by
 * the app: one export for each shape of target input the detector must flag,
 * and `noTarget`, which it must not.
 */

import { z } from "zod"

const targetSchema = z.object({ name: z.string(), jellyfinEndpoint: z.string() })

function wrap<T>(handler: (input: unknown) => Promise<T>) {
  return (input: unknown) => handler(input)
}

export async function namedParameter(serverURL: string) {
  return serverURL.length
}

export async function destructuredParameter({ host }: { host: string }) {
  return host.length
}

export async function typedProperty(settings: { name: string; baseUrl: string }) {
  return settings.name
}

export async function formDataKey(formData: FormData) {
  return String(formData.get("publicUrl"))
}

export async function parsedUnknownInput(input: unknown) {
  return targetSchema.safeParse(input).success
}

export const wrappedParsedInput = wrap(async (input) => targetSchema.parse(input).name)

export async function noTarget(name: string, formData: FormData) {
  return `${name}${String(formData.get("displayName"))}`
}
