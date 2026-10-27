/**
 * @jest-environment node
 */

/**
 * The assistant sources' secrets on PostgreSQL: `McpServer.authHeaderSecret`
 * and `KnowledgeSource.token` are encrypted in the table and read back as
 * plaintext through the app's client (`ENCRYPTED_FIELDS`).
 *
 * Gated by `describePg` and run only by `npm run test:integration`.
 */

import { randomBytes, randomUUID } from 'node:crypto'

import { describePg } from '@/test/helpers/integration'

const RUN = `assistant-${randomUUID()}`

describePg('assistant source secrets on PostgreSQL', (databaseUrl) => {
  let prisma: typeof import('@/lib/prisma').prisma

  beforeAll(() => {
    process.env.DATABASE_URL = databaseUrl
    process.env.ENCRYPTION_KEYS = `k1:${randomBytes(32).toString('base64')}`
    jest.resetModules()
    prisma = require('@/lib/prisma').prisma
  })

  afterAll(async () => {
    await prisma.mcpServer.deleteMany({ where: { name: { startsWith: RUN } } })
    await prisma.knowledgeSource.deleteMany({ where: { name: { startsWith: RUN } } })
    await prisma.$disconnect()
  })

  it('stores the header value and token encrypted and reads them back', async () => {
    const server = await prisma.mcpServer.create({
      data: { name: `${RUN}-mcp`, url: 'https://mcp.example.com/mcp', authHeaderName: 'Authorization', authHeaderSecret: 'Bearer plain-secret', enabledTools: ['search'] },
    })
    const source = await prisma.knowledgeSource.create({
      data: { name: `${RUN}-kb`, repo: 'mchestr/knowledgebase', token: 'ghp_plain_secret' },
    })

    const [rawServer] = await prisma.$queryRaw<Array<{ authHeaderSecret: string }>>`SELECT "authHeaderSecret" FROM "McpServer" WHERE id = ${server.id}`
    const [rawSource] = await prisma.$queryRaw<Array<{ token: string }>>`SELECT "token" FROM "KnowledgeSource" WHERE id = ${source.id}`

    expect(rawServer.authHeaderSecret).toMatch(/^enc:v2:k1:/)
    expect(rawSource.token).toMatch(/^enc:v2:k1:/)
    expect(JSON.stringify([rawServer, rawSource])).not.toContain('plain-secret')

    expect((await prisma.mcpServer.findUniqueOrThrow({ where: { id: server.id } })).authHeaderSecret).toBe('Bearer plain-secret')
    expect((await prisma.knowledgeSource.findUniqueOrThrow({ where: { id: source.id } })).token).toBe('ghp_plain_secret')
  })
})
