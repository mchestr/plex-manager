import { filterSections } from '@/components/wrapped/wrapped-section-filter'
import { WrappedSection } from '@/types/wrapped'

describe('filterSections', () => {
  const createMockSection = (overrides?: Partial<WrappedSection>): WrappedSection => ({
    id: 'section-1',
    type: 'hero',
    title: 'Test Section',
    content: 'Test content',
    ...overrides,
  })

  beforeEach(() => {
    // Suppress console warnings in tests
    jest.spyOn(console, 'warn').mockImplementation()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('basic filtering', () => {
    it('should return all valid sections', () => {
      const sections: WrappedSection[] = [
        createMockSection({ id: 'section-1', type: 'hero' }),
        createMockSection({ id: 'section-2', type: 'total-watch-time' }),
        createMockSection({ id: 'section-3', type: 'top-movies' }),
      ]

      const result = filterSections(sections)

      expect(result).toHaveLength(3)
      expect(result).toEqual(sections)
    })

    it('should return empty array when input is empty', () => {
      const result = filterSections([])

      expect(result).toEqual([])
    })

    it('should filter out null sections', () => {
      const sections = [
        createMockSection({ id: 'section-1' }),
        null as any,
        createMockSection({ id: 'section-2' }),
      ]

      const result = filterSections(sections)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('section-1')
      expect(result[1].id).toBe('section-2')
    })

    it('should filter out undefined sections', () => {
      const sections = [
        createMockSection({ id: 'section-1' }),
        undefined as any,
        createMockSection({ id: 'section-2' }),
      ]

      const result = filterSections(sections)

      expect(result).toHaveLength(2)
      expect(result[0].id).toBe('section-1')
      expect(result[1].id).toBe('section-2')
    })
  })

  describe('service-stats filtering', () => {
    it('should filter out service-stats sections', () => {
      const sections: WrappedSection[] = [
        createMockSection({ id: 'section-1', type: 'hero' }),
        createMockSection({ id: 'section-2', type: 'service-stats' }),
        createMockSection({ id: 'section-3', type: 'top-movies' }),
      ]

      const result = filterSections(sections)

      expect(result).toHaveLength(2)
      expect(result.find((s) => s.type === 'service-stats')).toBeUndefined()
    })

    it('should filter out multiple service-stats sections', () => {
      const sections: WrappedSection[] = [
        createMockSection({ id: 'section-1', type: 'service-stats' }),
        createMockSection({ id: 'section-2', type: 'hero' }),
        createMockSection({ id: 'section-3', type: 'service-stats' }),
      ]

      const result = filterSections(sections)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('hero')
    })
  })

  describe('invalid type handling', () => {
    it('should include sections with missing type but warn in development', () => {
      const originalEnv = process.env.NODE_ENV
      jest.replaceProperty(process.env, 'NODE_ENV', 'development')

      const sections = [
        createMockSection({ id: 'section-1', type: '' as any }),
      ]

      const result = filterSections(sections)

      expect(result).toHaveLength(1)
      expect(console.warn).toHaveBeenCalledWith(
        '[WrappedViewer] Section missing valid type:',
        expect.objectContaining({
          id: 'section-1',
          type: '',
        })
      )

      jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
    })

    it('should include sections with invalid type but warn in development', () => {
      const originalEnv = process.env.NODE_ENV
      jest.replaceProperty(process.env, 'NODE_ENV', 'development')

      const sections = [
        createMockSection({ id: 'section-1', type: null as any }),
      ]

      const result = filterSections(sections)

      expect(result).toHaveLength(1)
      expect(console.warn).toHaveBeenCalledWith(
        '[WrappedViewer] Section missing valid type:',
        expect.objectContaining({
          id: 'section-1',
        })
      )

      jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
    })

    it('should not warn about invalid types in production', () => {
      const originalEnv = process.env.NODE_ENV
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')

      const sections = [
        createMockSection({ id: 'section-1', type: '' as any }),
      ]

      filterSections(sections)

      expect(console.warn).not.toHaveBeenCalled()

      jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
    })

    it('should include sections with whitespace-only type', () => {
      const sections = [
        createMockSection({ id: 'section-1', type: '   ' as any }),
      ]

      const result = filterSections(sections)

      expect(result).toHaveLength(1)
    })

    it('should include sections with non-string type', () => {
      const sections = [
        createMockSection({ id: 'section-1', type: 123 as any }),
      ]

      const result = filterSections(sections)

      expect(result).toHaveLength(1)
    })
  })

  describe('development mode warnings', () => {
    it('should warn when filtering null sections in development', () => {
      const originalEnv = process.env.NODE_ENV
      jest.replaceProperty(process.env, 'NODE_ENV', 'development')

      const sections = [null as any, createMockSection()]

      filterSections(sections)

      expect(console.warn).toHaveBeenCalledWith(
        '[WrappedViewer] Filtered out null/undefined section'
      )

      jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
    })

    it('should not warn when filtering null sections in production', () => {
      const originalEnv = process.env.NODE_ENV
      jest.replaceProperty(process.env, 'NODE_ENV', 'production')

      const sections = [null as any, createMockSection()]

      filterSections(sections)

      expect(console.warn).not.toHaveBeenCalled()

      jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
    })
  })

  describe('complex filtering scenarios', () => {
    it('should handle mixed valid and invalid sections', () => {
      const sections = [
        createMockSection({ id: 'section-1', type: 'hero' }),
        null as any,
        createMockSection({ id: 'section-2', type: 'service-stats' }),
        undefined as any,
        createMockSection({ id: 'section-3', type: 'top-movies' }),
        createMockSection({ id: 'section-4', type: '' as any }),
      ]

      const result = filterSections(sections)

      // Should include: section-1, section-3, section-4
      // Should exclude: null, service-stats, undefined
      expect(result).toHaveLength(3)
      expect(result.map((s) => s.id)).toEqual(['section-1', 'section-3', 'section-4'])
    })

    it('should preserve order of valid sections', () => {
      const sections: WrappedSection[] = [
        createMockSection({ id: 'section-3', type: 'top-movies' }),
        createMockSection({ id: 'section-1', type: 'hero' }),
        createMockSection({ id: 'section-2', type: 'total-watch-time' }),
      ]

      const result = filterSections(sections)

      expect(result.map((s) => s.id)).toEqual(['section-3', 'section-1', 'section-2'])
    })

    it('should handle all sections being filtered out', () => {
      const sections = [
        null as any,
        undefined as any,
        createMockSection({ type: 'service-stats' }),
      ]

      const result = filterSections(sections)

      expect(result).toEqual([])
    })
  })

  describe('all section types', () => {
    it('should allow all valid section types except service-stats', () => {
      const validTypes: WrappedSection['type'][] = [
        'hero',
        'total-watch-time',
        'movies-breakdown',
        'shows-breakdown',
        'top-movies',
        'top-shows',
        'server-stats',
        'overseerr-stats',
        'insights',
        'fun-facts',
      ]

      const sections = validTypes.map((type) =>
        createMockSection({ id: `section-${type}`, type })
      )

      const result = filterSections(sections)

      expect(result).toHaveLength(validTypes.length)
      expect(result.map((s) => s.type)).toEqual(validTypes)
    })

    it('should filter service-stats but allow server-stats', () => {
      const sections: WrappedSection[] = [
        createMockSection({ id: 'section-1', type: 'server-stats' }),
        createMockSection({ id: 'section-2', type: 'service-stats' }),
      ]

      const result = filterSections(sections)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('server-stats')
    })
  })

  describe('section data preservation', () => {
    it('should preserve all section properties', () => {
      const section = createMockSection({
        id: 'section-1',
        type: 'hero',
        title: 'Test Title',
        subtitle: 'Test Subtitle',
        content: 'Test Content',
        data: { prominentStat: { value: 100, label: 'Test', description: 'Desc' } },
        animationDelay: 500,
      })

      const result = filterSections([section])

      expect(result[0]).toEqual(section)
    })

    it('should not mutate original sections array', () => {
      const sections = [
        createMockSection({ id: 'section-1' }),
        createMockSection({ id: 'section-2' }),
      ]
      const originalSections = [...sections]

      filterSections(sections)

      expect(sections).toEqual(originalSections)
    })
  })
})

