/**
 * Tests for actions/prompts.ts - prompt template CRUD operations
 */

import {
  getPromptTemplates,
  getPromptTemplate,
  getActivePromptTemplate,
  createPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  setActivePromptTemplate,
} from '@/actions/prompts'
import { requireAdmin } from '@/lib/admin'
import { revalidatePath } from 'next/cache'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

// Mock dependencies
jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const mockPrisma = prismaMock
const mockRevalidatePath = revalidatePath as jest.MockedFunction<typeof revalidatePath>

describe('Prompt Template Actions', () => {
  const mockSession = {
    user: {
      id: 'admin-1',
      email: 'admin@example.com',
      name: 'Admin User',
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAdmin.mockResolvedValue(mockSession as any)
  })

  describe('getPromptTemplates', () => {
    it('should return all prompt templates ordered by active status', async () => {
      const mockTemplates = [
        { id: '1', name: 'Active Template', isActive: true },
        { id: '2', name: 'Inactive Template', isActive: false },
      ]

      mockPrisma.promptTemplate.findMany.mockResolvedValue(mockTemplates as any)

      const result = await getPromptTemplates()

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockTemplates)
      expect(mockPrisma.promptTemplate.findMany).toHaveBeenCalledWith({
        orderBy: [
          { isActive: 'desc' },
          { updatedAt: 'desc' },
        ],
      })
    })

    it('should require admin access', async () => {
      await getPromptTemplates()
      expect(mockRequireAdmin).toHaveBeenCalled()
    })
  })

  describe('getPromptTemplate', () => {
    it('should return template when found', async () => {
      const mockTemplate = {
        id: '1',
        name: 'Test Template',
        template: 'Template content',
        isActive: true,
      }

      mockPrisma.promptTemplate.findUnique.mockResolvedValue(mockTemplate as any)

      const result = await getPromptTemplate('1')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockTemplate)
      expect(mockPrisma.promptTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
      })
    })

    it('should return error when template not found', async () => {
      mockPrisma.promptTemplate.findUnique.mockResolvedValue(null)

      const result = await getPromptTemplate('nonexistent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Template not found')
    })
  })

  describe('getActivePromptTemplate', () => {
    it('should return active template', async () => {
      const mockTemplate = {
        id: '1',
        name: 'Active Template',
        isActive: true,
      }

      mockPrisma.promptTemplate.findFirst.mockResolvedValue(mockTemplate as any)

      const result = await getActivePromptTemplate()

      expect(result).toEqual(mockTemplate)
      expect(mockPrisma.promptTemplate.findFirst).toHaveBeenCalledWith({
        where: { isActive: true },
      })
    })

    it('should return null when no active template', async () => {
      mockPrisma.promptTemplate.findFirst.mockResolvedValue(null)

      const result = await getActivePromptTemplate()

      expect(result).toBeNull()
    })

    it('should not require admin access', async () => {
      await getActivePromptTemplate()
      expect(mockRequireAdmin).not.toHaveBeenCalled()
    })
  })

  describe('createPromptTemplate', () => {
    const validInput = {
      name: 'New Template',
      description: 'A test template',
      template: 'Template content {{userName}}',
      isActive: false,
    }

    it('should create template successfully', async () => {
      const mockCreated = {
        id: '1',
        ...validInput,
        version: 1,
        updatedBy: 'admin-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.promptTemplate.create.mockResolvedValue(mockCreated as any)

      const result = await createPromptTemplate(validInput)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockCreated)
      expect(mockPrisma.promptTemplate.create).toHaveBeenCalledWith({
        data: {
          name: validInput.name,
          description: validInput.description || null,
          template: validInput.template,
          isActive: validInput.isActive || false,
          updatedBy: 'admin-1',
        },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/prompts')
    })

    it('should deactivate other templates when creating active one', async () => {
      const activeInput = { ...validInput, isActive: true }
      const mockCreated = { id: '1', ...activeInput }

      mockPrisma.promptTemplate.updateMany.mockResolvedValue({ count: 2 } as any)
      mockPrisma.promptTemplate.create.mockResolvedValue(mockCreated as any)

      await createPromptTemplate(activeInput)

      expect(mockPrisma.promptTemplate.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      })
    })

    it('should not deactivate others when creating inactive template', async () => {
      const inactiveInput = { ...validInput, isActive: false }
      const mockCreated = { id: '1', ...inactiveInput }

      mockPrisma.promptTemplate.create.mockResolvedValue(mockCreated as any)

      await createPromptTemplate(inactiveInput)

      expect(mockPrisma.promptTemplate.updateMany).not.toHaveBeenCalled()
    })

    it('should return validation error for invalid input', async () => {
      const invalidInput = { name: '', template: '' }

      const result = await createPromptTemplate(invalidInput as any)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(mockPrisma.promptTemplate.create).not.toHaveBeenCalled()
    })

    it('should handle database errors', async () => {
      mockPrisma.promptTemplate.create.mockRejectedValue(new Error('DB error'))

      const result = await createPromptTemplate(validInput)

      expect(result.success).toBe(false)
      expect(result.error).toBe('DB error')
    })
  })

  describe('updatePromptTemplate', () => {
    const existingTemplate = {
      id: '1',
      name: 'Old Name',
      template: 'Old template',
      isActive: false,
      version: 1,
    }

    const updateInput = {
      name: 'New Name',
      template: 'New template',
      isActive: true,
    }

    beforeEach(() => {
      mockPrisma.promptTemplate.findUnique.mockResolvedValue(existingTemplate as any)
    })

    it('should update template successfully', async () => {
      const mockUpdated = {
        ...existingTemplate,
        ...updateInput,
        version: 2,
        updatedBy: 'admin-1',
      }

      mockPrisma.promptTemplate.update.mockResolvedValue(mockUpdated as any)

      const result = await updatePromptTemplate('1', updateInput)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockUpdated)
      expect(mockPrisma.promptTemplate.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: {
          name: updateInput.name,
          description: null,
          template: updateInput.template,
          isActive: updateInput.isActive,
          version: 2,
          updatedBy: 'admin-1',
        },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/prompts')
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/prompts/1')
    })

    it('should deactivate others when activating template', async () => {
      mockPrisma.promptTemplate.updateMany.mockResolvedValue({ count: 1 } as any)
      mockPrisma.promptTemplate.update.mockResolvedValue({
        ...existingTemplate,
        ...updateInput,
      } as any)

      await updatePromptTemplate('1', updateInput)

      expect(mockPrisma.promptTemplate.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      })
    })

    it('should not deactivate others when template is already active', async () => {
      const alreadyActive = { ...existingTemplate, isActive: true }
      mockPrisma.promptTemplate.findUnique.mockResolvedValue(alreadyActive as any)
      mockPrisma.promptTemplate.update.mockResolvedValue(alreadyActive as any)

      await updatePromptTemplate('1', { ...updateInput, isActive: true })

      expect(mockPrisma.promptTemplate.updateMany).not.toHaveBeenCalled()
    })

    it('should return error when template not found', async () => {
      mockPrisma.promptTemplate.findUnique.mockResolvedValue(null)

      const result = await updatePromptTemplate('nonexistent', updateInput)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Template not found')
      expect(mockPrisma.promptTemplate.update).not.toHaveBeenCalled()
    })

    it('should preserve isActive when not provided', async () => {
      const inputWithoutActive = {
        name: 'New Name',
        template: 'New template',
      }

      mockPrisma.promptTemplate.update.mockResolvedValue({
        ...existingTemplate,
        ...inputWithoutActive,
      } as any)

      await updatePromptTemplate('1', inputWithoutActive)

      expect(mockPrisma.promptTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isActive: false, // Preserved from existing
          }),
        })
      )
    })
  })

  describe('deletePromptTemplate', () => {
    it('should delete template successfully', async () => {
      const inactiveTemplate = {
        id: '1',
        name: 'Inactive Template',
        isActive: false,
      }

      mockPrisma.promptTemplate.findUnique.mockResolvedValue(inactiveTemplate as any)
      mockPrisma.promptTemplate.delete.mockResolvedValue(inactiveTemplate as any)

      const result = await deletePromptTemplate('1')

      expect(result.success).toBe(true)
      expect(mockPrisma.promptTemplate.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/prompts')
    })

    it('should prevent deleting active template', async () => {
      const activeTemplate = {
        id: '1',
        name: 'Active Template',
        isActive: true,
      }

      mockPrisma.promptTemplate.findUnique.mockResolvedValue(activeTemplate as any)

      const result = await deletePromptTemplate('1')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Cannot delete the active template')
      expect(mockPrisma.promptTemplate.delete).not.toHaveBeenCalled()
    })

    it('should return error when template not found', async () => {
      mockPrisma.promptTemplate.findUnique.mockResolvedValue(null)

      const result = await deletePromptTemplate('nonexistent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Template not found')
      expect(mockPrisma.promptTemplate.delete).not.toHaveBeenCalled()
    })
  })

  describe('setActivePromptTemplate', () => {
    it('should set template as active and deactivate others', async () => {
      const template = {
        id: '1',
        name: 'Template',
        isActive: false,
      }

      mockPrisma.promptTemplate.findUnique.mockResolvedValue(template as any)
      mockPrisma.promptTemplate.updateMany.mockResolvedValue({ count: 2 } as any)
      mockPrisma.promptTemplate.update.mockResolvedValue({
        ...template,
        isActive: true,
      } as any)

      const result = await setActivePromptTemplate('1')

      expect(result.success).toBe(true)
      expect(mockPrisma.promptTemplate.updateMany).toHaveBeenCalledWith({
        where: { isActive: true },
        data: { isActive: false },
      })
      expect(mockPrisma.promptTemplate.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { isActive: true },
      })
      expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/prompts')
    })

    it('should return error when template not found', async () => {
      mockPrisma.promptTemplate.findUnique.mockResolvedValue(null)

      const result = await setActivePromptTemplate('nonexistent')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Template not found')
      expect(mockPrisma.promptTemplate.update).not.toHaveBeenCalled()
    })
  })
})

