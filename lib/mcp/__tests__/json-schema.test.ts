/**
 * @jest-environment node
 */
import { z } from 'zod'

import { toolInputSchema } from '@/lib/mcp/json-schema'

describe('toolInputSchema', () => {
  it('gives an empty object schema for no input', () => {
    const { inputSchema, unwrap } = toolInputSchema(null)
    expect(inputSchema).toEqual({ type: 'object', properties: {}, additionalProperties: false })
    expect(unwrap({ anything: 1 })).toBeUndefined()
  })

  it('keeps an object schema as the caller sends it', () => {
    const { inputSchema, unwrap } = toolInputSchema(z.object({ code: z.string().trim().toUpperCase(), uses: z.number().default(1) }))
    expect(inputSchema).toMatchObject({ type: 'object', required: ['code'] })
    expect(inputSchema).not.toHaveProperty('$schema')
    expect(unwrap({ code: 'abc' })).toEqual({ code: 'abc' })
  })

  it('wraps a bare value under `input`', () => {
    const { inputSchema, unwrap } = toolInputSchema(z.boolean())
    expect(inputSchema).toEqual({ type: 'object', properties: { input: { type: 'boolean' } }, required: ['input'], additionalProperties: false })
    expect(unwrap({ input: true })).toBe(true)
  })

  it('leaves `input` optional when the schema accepts nothing', () => {
    const { inputSchema } = toolInputSchema(z.string().optional())
    expect(inputSchema).not.toHaveProperty('required')
  })
})
