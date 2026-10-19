/**
 * Tests for actions/prompts.ts - prompt template CRUD operations.
 *
 * P4.6: each mutation writes one `CONFIG_CHANGED` audit row with a redacted
 * diff, and a change of the active template runs in one transaction.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

import {
  createPromptTemplate,
  deletePromptTemplate,
  getPromptTemplate,
  getPromptTemplates,
  setActivePromptTemplate,
  updatePromptTemplate,
} from '@/actions/prompts'
import { buildPromptTemplate } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { requireAdmin } from '@/lib/admin'
import { AuditEventType } from '@/lib/security/audit-log'

jest.mock('@/lib/admin', () => ({ requireAdmin: jest.fn() }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const mockSession = getServerSession as jest.Mock
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>

const adminSession = {
  user: { id: 'admin-1', email: 'admin@example.com', name: 'Admin User', isAdmin: true },
  expires: '2099-01-01T00:00:00.000Z',
}

/** The audit rows written through prisma (logAuditEvent and recordAuditEvent both land here). */
function auditRows() {
  return prismaMock.auditLog.create.mock.calls.map(([args]) => args.data)
}

/** Lets the fire-and-forget audit write settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  mockRequireAdmin.mockResolvedValue(adminSession)
  mockSession.mockResolvedValue(adminSession)
  prismaMock.$transaction.mockImplementation((async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)) as never)
})

describe('getPromptTemplates', () => {
  it('returns all prompt templates ordered by active status', async () => {
    const templates = [buildPromptTemplate({ id: '1', isActive: true }), buildPromptTemplate({ id: '2' })]
    prismaMock.promptTemplate.findMany.mockResolvedValue(templates)

    const result = await getPromptTemplates()

    expect(result).toEqual({ success: true, data: templates })
    expect(prismaMock.promptTemplate.findMany).toHaveBeenCalledWith({
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    })
    expect(mockRequireAdmin).toHaveBeenCalled()
  })
})

describe('getPromptTemplate', () => {
  it('returns the template when found', async () => {
    const template = buildPromptTemplate({ id: '1' })
    prismaMock.promptTemplate.findUnique.mockResolvedValue(template)

    await expect(getPromptTemplate('1')).resolves.toEqual({ success: true, data: template })
  })

  it('returns an error when the template is not found', async () => {
    prismaMock.promptTemplate.findUnique.mockResolvedValue(null)

    await expect(getPromptTemplate('missing')).resolves.toEqual({ success: false, error: 'Template not found' })
  })
})

describe('createPromptTemplate', () => {
  const input = { name: 'New Template', description: 'A test template', template: 'Hello {{userName}}', isActive: false }

  it('creates an inactive template and writes one CONFIG_CHANGED row without the text', async () => {
    const created = buildPromptTemplate({ id: 't1', ...input, updatedBy: 'admin-1' })
    prismaMock.promptTemplate.create.mockResolvedValue(created)

    const result = await createPromptTemplate(input)
    await flush()

    expect(result).toEqual({ success: true, data: created })
    expect(prismaMock.promptTemplate.create).toHaveBeenCalledWith({
      data: { name: input.name, description: input.description, template: input.template, isActive: false, updatedBy: 'admin-1' },
    })
    expect(prismaMock.promptTemplate.updateMany).not.toHaveBeenCalled()
    expect(auditRows()).toEqual([
      expect.objectContaining({
        type: AuditEventType.CONFIG_CHANGED,
        actorUserId: 'admin-1',
        details: expect.objectContaining({
          action: 'created',
          templateId: 't1',
          section: 'prompt',
          changedFields: ['description', 'isActive', 'name', 'template'],
        }),
      }),
    ])
    expect(JSON.stringify(auditRows())).not.toContain('Hello {{userName}}')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/prompts')
  })

  it('activates a new active template in the same transaction', async () => {
    const created = buildPromptTemplate({ id: 't1', ...input })
    prismaMock.promptTemplate.create.mockResolvedValue(created)
    prismaMock.promptTemplate.update.mockResolvedValue({ ...created, isActive: true })

    const result = await createPromptTemplate({ ...input, isActive: true })

    expect(result).toMatchObject({ success: true, data: { isActive: true } })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.promptTemplate.updateMany).toHaveBeenCalledWith({ data: { isActive: false } })
    expect(prismaMock.promptTemplate.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { isActive: true } })
  })

  it('returns a validation error for invalid input', async () => {
    const result = await createPromptTemplate({ name: '', template: 'x' })

    expect(result).toMatchObject({ success: false, code: 'VALIDATION', error: 'Name is required' })
    expect(prismaMock.promptTemplate.create).not.toHaveBeenCalled()
  })

  it('does not echo database errors', async () => {
    prismaMock.$transaction.mockRejectedValue(new Error('Database error at db:5432'))

    await expect(createPromptTemplate(input)).resolves.toEqual({
      success: false,
      code: 'INTERNAL',
      error: 'Failed to create prompt template',
    })
  })

  it('refuses non-admins', async () => {
    mockSession.mockResolvedValue({ ...adminSession, user: { ...adminSession.user, isAdmin: false } })

    await expect(createPromptTemplate(input)).resolves.toMatchObject({ success: false, code: 'FORBIDDEN' })
    expect(prismaMock.promptTemplate.create).not.toHaveBeenCalled()
  })
})

describe('updatePromptTemplate', () => {
  const existing = buildPromptTemplate({ id: 't1', name: 'Old', template: 'Old text', isActive: false, version: 1 })
  const input = { id: 't1', name: 'Updated', template: 'Old text' }

  it('updates the template, bumps the version and writes one CONFIG_CHANGED row', async () => {
    prismaMock.promptTemplate.findUnique.mockResolvedValue(existing)
    const updated = { ...existing, name: 'Updated', version: 2 }
    prismaMock.promptTemplate.update.mockResolvedValue(updated)

    const result = await updatePromptTemplate(input)
    await flush()

    expect(result).toEqual({ success: true, data: updated })
    expect(prismaMock.promptTemplate.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { name: 'Updated', description: null, template: 'Old text', version: 2, updatedBy: 'admin-1' },
    })
    expect(prismaMock.promptTemplate.updateMany).not.toHaveBeenCalled()
    expect(auditRows()).toEqual([
      expect.objectContaining({
        type: AuditEventType.CONFIG_CHANGED,
        details: expect.objectContaining({ action: 'updated', templateId: 't1', changedFields: ['name'] }),
      }),
    ])
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/prompts/t1')
  })

  it('activates in the same transaction when the edit turns the template on', async () => {
    prismaMock.promptTemplate.findUnique.mockResolvedValue(existing)
    prismaMock.promptTemplate.update.mockResolvedValue({ ...existing, isActive: true })

    await updatePromptTemplate({ ...input, isActive: true })

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.promptTemplate.updateMany).toHaveBeenCalledWith({ data: { isActive: false } })
    expect(prismaMock.promptTemplate.update).toHaveBeenLastCalledWith({ where: { id: 't1' }, data: { isActive: true } })
  })

  it('does not reactivate an already active template', async () => {
    prismaMock.promptTemplate.findUnique.mockResolvedValue({ ...existing, isActive: true })
    prismaMock.promptTemplate.update.mockResolvedValue({ ...existing, isActive: true })

    await updatePromptTemplate({ ...input, isActive: true })

    expect(prismaMock.promptTemplate.updateMany).not.toHaveBeenCalled()
  })

  it('returns NOT_FOUND for a missing template', async () => {
    prismaMock.promptTemplate.findUnique.mockResolvedValue(null)

    await expect(updatePromptTemplate(input)).resolves.toEqual({
      success: false,
      code: 'NOT_FOUND',
      error: 'Template not found',
    })
    expect(prismaMock.promptTemplate.update).not.toHaveBeenCalled()
  })

  it('refuses a malformed id', async () => {
    await expect(updatePromptTemplate({ ...input, id: '../1' })).resolves.toMatchObject({ code: 'VALIDATION' })
  })
})

describe('deletePromptTemplate', () => {
  it('deletes an inactive template and writes one CONFIG_CHANGED row', async () => {
    prismaMock.promptTemplate.findUnique.mockResolvedValue(buildPromptTemplate({ id: 't1', isActive: false }))

    const result = await deletePromptTemplate('t1')
    await flush()

    expect(result).toEqual({ success: true, data: null })
    expect(prismaMock.promptTemplate.delete).toHaveBeenCalledWith({ where: { id: 't1' } })
    expect(auditRows()).toEqual([
      expect.objectContaining({ details: expect.objectContaining({ action: 'deleted', templateId: 't1' }) }),
    ])
  })

  it('refuses to delete the active template', async () => {
    prismaMock.promptTemplate.findUnique.mockResolvedValue(buildPromptTemplate({ id: 't1', isActive: true }))

    const result = await deletePromptTemplate('t1')

    expect(result).toMatchObject({ success: false, code: 'CONFLICT' })
    expect(prismaMock.promptTemplate.delete).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  it('returns NOT_FOUND for a missing template', async () => {
    prismaMock.promptTemplate.findUnique.mockResolvedValue(null)

    await expect(deletePromptTemplate('missing')).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' })
  })
})

describe('setActivePromptTemplate', () => {
  it('activates in one transaction and writes its audit row inside it', async () => {
    const template = buildPromptTemplate({ id: 't2', isActive: false })
    prismaMock.promptTemplate.findUnique.mockResolvedValue(template)
    prismaMock.promptTemplate.update.mockResolvedValue({ ...template, isActive: true })

    const result = await setActivePromptTemplate('t2')

    expect(result).toEqual({ success: true, data: null })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    // The unfiltered deactivation locks every row, then the one template is switched on
    expect(prismaMock.promptTemplate.updateMany).toHaveBeenCalledWith({ data: { isActive: false } })
    expect(prismaMock.promptTemplate.update).toHaveBeenCalledWith({ where: { id: 't2' }, data: { isActive: true } })
    const updateOrder = prismaMock.promptTemplate.updateMany.mock.invocationCallOrder[0]
    expect(updateOrder).toBeLessThan(prismaMock.promptTemplate.update.mock.invocationCallOrder[0])
    // recordAuditEvent awaited the row before the transaction returned
    expect(auditRows()).toEqual([
      expect.objectContaining({
        type: AuditEventType.CONFIG_CHANGED,
        details: expect.objectContaining({ action: 'activated', templateId: 't2', changedFields: ['isActive'] }),
      }),
    ])
  })

  it('returns NOT_FOUND and changes nothing for a missing template', async () => {
    prismaMock.promptTemplate.findUnique.mockResolvedValue(null)

    await expect(setActivePromptTemplate('missing')).resolves.toMatchObject({ success: false, code: 'NOT_FOUND' })
    expect(prismaMock.promptTemplate.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  it('fails as a whole when the audit row cannot be written', async () => {
    prismaMock.promptTemplate.findUnique.mockResolvedValue(buildPromptTemplate({ id: 't2' }))
    prismaMock.auditLog.create.mockRejectedValue(new Error('write failed'))

    await expect(setActivePromptTemplate('t2')).resolves.toMatchObject({ success: false, code: 'INTERNAL' })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
