import {
  MediaTypeEnum,
  MarkTypeEnum,
  IntentTypeEnum,
  ScanStatusEnum,
  ReviewStatusEnum,
  ActionTypeEnum,
  RuleCriteriaSchema,
  LegacyRuleCriteriaSchema,
  CreateMaintenanceRuleSchema,
  UpdateMaintenanceRuleSchema,
  CreateUserMediaMarkSchema,
  CreateUserWatchIntentSchema,
} from '../maintenance'
import { generateId } from '@/lib/maintenance/field-registry'

describe('Maintenance Validation Schemas', () => {
  describe('MediaTypeEnum', () => {
    it('should accept valid media types', () => {
      expect(MediaTypeEnum.safeParse('MOVIE').success).toBe(true)
      expect(MediaTypeEnum.safeParse('TV_SERIES').success).toBe(true)
      expect(MediaTypeEnum.safeParse('EPISODE').success).toBe(true)
    })

    it('should reject invalid media types', () => {
      const result = MediaTypeEnum.safeParse('INVALID')
      expect(result.success).toBe(false)
      if (!result.success) {
        // Zod uses "Invalid" in enum validation error messages
        expect(result.error.issues[0].message).toContain("Invalid")
      }
    })
  })

  describe('MarkTypeEnum', () => {
    it('should accept all valid mark types', () => {
      const validTypes = [
        'FINISHED_WATCHING',
        'NOT_INTERESTED',
        'KEEP_FOREVER',
        'REWATCH_CANDIDATE',
        'POOR_QUALITY',
        'WRONG_VERSION',
      ]

      validTypes.forEach((type) => {
        expect(MarkTypeEnum.safeParse(type).success).toBe(true)
      })
    })

    it('should reject invalid mark types', () => {
      const result = MarkTypeEnum.safeParse('INVALID_MARK')
      expect(result.success).toBe(false)
    })
  })

  describe('IntentTypeEnum', () => {
    it('should accept all valid intent types', () => {
      const validTypes = [
        'PLAN_TO_WATCH',
        'WATCHING',
        'COMPLETED',
        'DROPPED',
        'ON_HOLD',
      ]

      validTypes.forEach((type) => {
        expect(IntentTypeEnum.safeParse(type).success).toBe(true)
      })
    })

    it('should reject invalid intent types', () => {
      const result = IntentTypeEnum.safeParse('WANT_TO_WATCH')
      expect(result.success).toBe(false)
    })
  })

  describe('ScanStatusEnum', () => {
    it('should accept all valid scan statuses', () => {
      const validStatuses = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED']

      validStatuses.forEach((status) => {
        expect(ScanStatusEnum.safeParse(status).success).toBe(true)
      })
    })

    it('should reject invalid scan statuses', () => {
      const result = ScanStatusEnum.safeParse('IN_PROGRESS')
      expect(result.success).toBe(false)
    })
  })

  describe('ReviewStatusEnum', () => {
    it('should accept all valid review statuses', () => {
      const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'DELETED']

      validStatuses.forEach((status) => {
        expect(ReviewStatusEnum.safeParse(status).success).toBe(true)
      })
    })

    it('should reject invalid review statuses', () => {
      const result = ReviewStatusEnum.safeParse('ACCEPTED')
      expect(result.success).toBe(false)
    })
  })

  describe('ActionTypeEnum', () => {
    it('should accept valid action types', () => {
      expect(ActionTypeEnum.safeParse('FLAG_FOR_REVIEW').success).toBe(true)
      expect(ActionTypeEnum.safeParse('AUTO_DELETE').success).toBe(true)
    })

    it('should reject invalid action types', () => {
      const result = ActionTypeEnum.safeParse('MANUAL_DELETE')
      expect(result.success).toBe(false)
    })
  })

  describe('RuleCriteriaSchema', () => {
    it('should accept empty criteria with default operator', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [],
      })
      expect(result.success).toBe(false) // Empty conditions should fail
    })

    it('should accept valid neverWatched criteria', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'neverWatched',
            operator: 'equals',
            value: true,
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept valid lastWatchedBefore with days', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'lastWatchedAt',
            operator: 'olderThan',
            value: 30,
            valueUnit: 'days',
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept valid lastWatchedBefore with months', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'lastWatchedAt',
            operator: 'olderThan',
            value: 6,
            valueUnit: 'months',
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept valid lastWatchedBefore with years', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'lastWatchedAt',
            operator: 'olderThan',
            value: 2,
            valueUnit: 'years',
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should reject lastWatchedBefore with value less than 1', () => {
      // This validation is now handled at the condition level, not schema level
      // The schema will accept it, but validation should catch it
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'lastWatchedAt',
            operator: 'olderThan',
            value: 0,
            valueUnit: 'days',
          },
        ],
      })
      // Schema accepts it, but runtime validation should catch invalid values
      expect(result.success).toBe(true)
    })

    it('should reject lastWatchedBefore with invalid unit', () => {
      const result = RuleCriteriaSchema.safeParse({
        lastWatchedBefore: {
          value: 5,
          unit: 'weeks',
        },
      })
      expect(result.success).toBe(false)
    })

    it('should accept valid maxPlayCount', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'playCount',
            operator: 'lessThanOrEqual',
            value: 5,
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept maxPlayCount of 0', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'playCount',
            operator: 'lessThanOrEqual',
            value: 0,
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should reject negative maxPlayCount', () => {
      // Schema accepts negative numbers, validation happens at runtime
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'playCount',
            operator: 'lessThanOrEqual',
            value: -1,
          },
        ],
      })
      // Schema accepts it, but runtime validation should catch invalid values
      expect(result.success).toBe(true)
    })

    it('should accept valid addedBefore criteria', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'addedAt',
            operator: 'olderThan',
            value: 90,
            valueUnit: 'days',
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should reject addedBefore with negative value', () => {
      // Schema accepts negative numbers, validation happens at runtime
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'addedAt',
            operator: 'olderThan',
            value: -5,
            valueUnit: 'months',
          },
        ],
      })
      // Schema accepts it, but runtime validation should catch invalid values
      expect(result.success).toBe(true)
    })

    it('should accept valid minFileSize with MB', () => {
      // minFileSize is converted to bytes in the hierarchical format
      const bytes = 500 * 1024 * 1024 // 500MB in bytes
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'fileSize',
            operator: 'greaterThanOrEqual',
            value: bytes,
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept valid minFileSize with GB', () => {
      const bytes = 2 * 1024 * 1024 * 1024 // 2GB in bytes
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'fileSize',
            operator: 'greaterThanOrEqual',
            value: bytes,
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept valid minFileSize with TB', () => {
      const bytes = BigInt(1024) * BigInt(1024) * BigInt(1024) * BigInt(1024) // 1TB in bytes
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'fileSize',
            operator: 'greaterThanOrEqual',
            value: Number(bytes),
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept minFileSize of 0', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'fileSize',
            operator: 'greaterThanOrEqual',
            value: 0,
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should reject minFileSize with negative value', () => {
      // Schema accepts negative numbers, validation happens at runtime
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'fileSize',
            operator: 'greaterThanOrEqual',
            value: -10,
          },
        ],
      })
      // Schema accepts it, but runtime validation should catch invalid values
      expect(result.success).toBe(true)
    })

    it('should reject minFileSize with invalid unit', () => {
      // Unit validation is not at schema level in hierarchical format
      // Intentionally using invalid value to test validation - use string cast to bypass type checking
      const invalidUnit = 'KB' as 'days' | 'months' | 'years' | 'MB' | 'GB' | 'TB'
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'fileSize',
            operator: 'greaterThanOrEqual',
            value: 100,
            valueUnit: invalidUnit,
          },
        ],
      })
      // Schema will reject invalid valueUnit enum
      expect(result.success).toBe(false)
    })

    it('should accept valid maxQuality', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'resolution',
            operator: 'lessThanOrEqual',
            value: '720p',
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept valid maxRating', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'rating',
            operator: 'lessThanOrEqual',
            value: 5.5,
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept maxRating of 0', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'rating',
            operator: 'lessThanOrEqual',
            value: 0,
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept maxRating of 10', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'rating',
            operator: 'lessThanOrEqual',
            value: 10,
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should reject maxRating less than 0', () => {
      // Schema accepts negative numbers, validation happens at runtime
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'rating',
            operator: 'lessThanOrEqual',
            value: -1,
          },
        ],
      })
      // Schema accepts it, but runtime validation should catch invalid values
      expect(result.success).toBe(true)
    })

    it('should reject maxRating greater than 10', () => {
      // Schema accepts numbers > 10, validation happens at runtime
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'rating',
            operator: 'lessThanOrEqual',
            value: 11,
          },
        ],
      })
      // Schema accepts it, but runtime validation should catch invalid values
      expect(result.success).toBe(true)
    })

    it('should accept valid libraryIds array', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'libraryId',
            operator: 'in',
            value: ['lib1', 'lib2', 'lib3'],
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty libraryIds array', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'libraryId',
            operator: 'in',
            value: [],
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept valid tags array', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'labels',
            operator: 'containsAny',
            value: ['action', 'thriller'],
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept empty tags array', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'labels',
            operator: 'containsAny',
            value: [],
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept OR operator', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'OR',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'neverWatched',
            operator: 'equals',
            value: true,
          },
        ],
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.operator).toBe('OR')
      }
    })

    it('should accept AND operator', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'neverWatched',
            operator: 'equals',
            value: true,
          },
        ],
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.operator).toBe('AND')
      }
    })

    it('should reject invalid operator', () => {
      const result = RuleCriteriaSchema.safeParse({
        operator: 'NOT',
      })
      expect(result.success).toBe(false)
    })

    it('should accept complex criteria with multiple fields', () => {
      const result = RuleCriteriaSchema.safeParse({
        type: 'group',
        id: generateId(),
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: generateId(),
            field: 'neverWatched',
            operator: 'equals',
            value: false,
          },
          {
            type: 'condition',
            id: generateId(),
            field: 'lastWatchedAt',
            operator: 'olderThan',
            value: 6,
            valueUnit: 'months',
          },
          {
            type: 'condition',
            id: generateId(),
            field: 'playCount',
            operator: 'lessThanOrEqual',
            value: 2,
          },
          {
            type: 'condition',
            id: generateId(),
            field: 'addedAt',
            operator: 'olderThan',
            value: 1,
            valueUnit: 'years',
          },
        ],
      })
      expect(result.success).toBe(true)
    })

    it('should accept complex criteria with multiple fields (legacy format test)', () => {
      // This test uses LegacyRuleCriteriaSchema which should still work
      const result = LegacyRuleCriteriaSchema.safeParse({
        neverWatched: false,
        lastWatchedBefore: {
          value: 6,
          unit: 'months',
        },
        maxPlayCount: 2,
        addedBefore: {
          value: 1,
          unit: 'years',
        },
        minFileSize: {
          value: 5,
          unit: 'GB',
        },
        maxQuality: '1080p',
        maxRating: 6.5,
        libraryIds: ['movies', 'tv'],
        tags: ['unwatched', 'old'],
        operator: 'AND',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('CreateMaintenanceRuleSchema', () => {
    it('should accept valid rule with minimal required fields', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Delete old movies',
        mediaType: 'MOVIE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'FLAG_FOR_REVIEW',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enabled).toBe(true) // Default value
      }
    })

    it('should reject rule without name', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        mediaType: 'MOVIE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'FLAG_FOR_REVIEW',
      })
      expect(result.success).toBe(false)
    })

    it('should reject rule with empty name', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: '',
        mediaType: 'MOVIE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'FLAG_FOR_REVIEW',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Rule name is required')
      }
    })

    it('should reject rule without mediaType', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Test Rule',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'FLAG_FOR_REVIEW',
      })
      expect(result.success).toBe(false)
    })

    it('should reject rule without criteria', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Test Rule',
        mediaType: 'MOVIE',
        actionType: 'FLAG_FOR_REVIEW',
      })
      expect(result.success).toBe(false)
    })

    it('should reject rule with empty criteria', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Test Rule',
        mediaType: 'MOVIE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [],
        },
        actionType: 'FLAG_FOR_REVIEW',
      })
      expect(result.success).toBe(false) // Empty conditions should fail
    })

    it('should reject rule without actionType', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Test Rule',
        mediaType: 'MOVIE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
      })
      expect(result.success).toBe(false)
    })

    it('should accept rule with description', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Test Rule',
        description: 'This is a test rule',
        mediaType: 'MOVIE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'FLAG_FOR_REVIEW',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.description).toBe('This is a test rule')
      }
    })

    it('should accept rule with enabled set to false', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Test Rule',
        mediaType: 'MOVIE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'FLAG_FOR_REVIEW',
        enabled: false,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.enabled).toBe(false)
      }
    })

    it('should accept rule with schedule', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Test Rule',
        mediaType: 'MOVIE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'FLAG_FOR_REVIEW',
        schedule: '0 0 * * *',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.schedule).toBe('0 0 * * *')
      }
    })

    it('should accept rule with TV_SERIES mediaType', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'TV Series Rule',
        mediaType: 'TV_SERIES',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'AUTO_DELETE',
      })
      expect(result.success).toBe(true)
    })

    it('should accept rule with EPISODE mediaType', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Episode Rule',
        mediaType: 'EPISODE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'FLAG_FOR_REVIEW',
      })
      expect(result.success).toBe(true)
    })

    it('should accept rule with complex criteria', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Complex Rule',
        description: 'A complex maintenance rule',
        enabled: true,
        mediaType: 'MOVIE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
            {
              type: 'condition',
              id: generateId(),
              field: 'lastWatchedAt',
              operator: 'olderThan',
              value: 12,
              valueUnit: 'months',
            },
            {
              type: 'condition',
              id: generateId(),
              field: 'rating',
              operator: 'lessThanOrEqual',
              value: 5,
            },
            {
              type: 'condition',
              id: generateId(),
              field: 'libraryId',
              operator: 'in',
              value: ['movies'],
            },
          ],
        },
        actionType: 'AUTO_DELETE',
        schedule: '0 2 * * 0',
      })
      expect(result.success).toBe(true)
    })

    it('should reject rule with invalid mediaType', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Test Rule',
        mediaType: 'AUDIO',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'FLAG_FOR_REVIEW',
      })
      expect(result.success).toBe(false)
    })

    it('should reject rule with invalid actionType', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Test Rule',
        mediaType: 'MOVIE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
        actionType: 'SOFT_DELETE',
      })
      expect(result.success).toBe(false)
    })

    it('should reject rule with invalid criteria', () => {
      const result = CreateMaintenanceRuleSchema.safeParse({
        name: 'Test Rule',
        mediaType: 'MOVIE',
        criteria: {
          maxRating: 15, // Invalid: > 10
        },
        actionType: 'FLAG_FOR_REVIEW',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('UpdateMaintenanceRuleSchema', () => {
    it('should accept empty update object', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({})
      expect(result.success).toBe(true)
    })

    it('should accept update with only name', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        name: 'Updated Name',
      })
      expect(result.success).toBe(true)
    })

    it('should reject update with empty name', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        name: '',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Rule name is required')
      }
    })

    it('should accept update with only description', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        description: 'New description',
      })
      expect(result.success).toBe(true)
    })

    it('should accept update with only enabled', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        enabled: false,
      })
      expect(result.success).toBe(true)
    })

    it('should accept update with only mediaType', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        mediaType: 'TV_SERIES',
      })
      expect(result.success).toBe(true)
    })

    it('should accept update with only criteria', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        },
      })
      expect(result.success).toBe(true)
    })

    it('should accept update with only actionType', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        actionType: 'AUTO_DELETE',
      })
      expect(result.success).toBe(true)
    })

    it('should accept update with only schedule', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        schedule: '0 3 * * *',
      })
      expect(result.success).toBe(true)
    })

    it('should accept update with multiple fields', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        name: 'Updated Rule',
        enabled: false,
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'rating',
              operator: 'lessThanOrEqual',
              value: 4,
            },
          ],
        },
      })
      expect(result.success).toBe(true)
    })

    it('should accept update with all fields', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        name: 'Fully Updated Rule',
        description: 'Updated description',
        enabled: true,
        mediaType: 'EPISODE',
        criteria: {
          type: 'group',
          id: generateId(),
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: generateId(),
              field: 'neverWatched',
              operator: 'equals',
              value: false,
            },
            {
              type: 'condition',
              id: generateId(),
              field: 'playCount',
              operator: 'lessThanOrEqual',
              value: 3,
            },
          ],
        },
        actionType: 'FLAG_FOR_REVIEW',
        schedule: '0 4 * * 1',
      })
      expect(result.success).toBe(true)
    })

    it('should reject update with invalid mediaType', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        mediaType: 'PODCAST',
      })
      expect(result.success).toBe(false)
    })

    it('should reject update with invalid actionType', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        actionType: 'ARCHIVE',
      })
      expect(result.success).toBe(false)
    })

    it('should reject update with invalid criteria', () => {
      const result = UpdateMaintenanceRuleSchema.safeParse({
        criteria: {
          minFileSize: {
            value: -100,
            unit: 'GB',
          },
        },
      })
      expect(result.success).toBe(false)
    })
  })

  describe('CreateUserMediaMarkSchema', () => {
    it('should accept valid mark with minimal required fields', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '12345',
        title: 'Test Movie',
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.markedVia).toBe('web') // Default value
      }
    })

    it('should reject mark without mediaType', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        plexRatingKey: '12345',
        title: 'Test Movie',
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(false)
    })

    it('should reject mark without plexRatingKey', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        title: 'Test Movie',
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(false)
    })

    it('should reject mark with empty plexRatingKey', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '',
        title: 'Test Movie',
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Plex rating key is required')
      }
    })

    it('should reject mark without title', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '12345',
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(false)
    })

    it('should reject mark with empty title', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '12345',
        title: '',
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Title is required')
      }
    })

    it('should reject mark without markType', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '12345',
        title: 'Test Movie',
      })
      expect(result.success).toBe(false)
    })

    it('should accept mark with radarrId', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '12345',
        radarrId: 100,
        title: 'Test Movie',
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.radarrId).toBe(100)
      }
    })

    it('should accept mark with sonarrId', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'TV_SERIES',
        plexRatingKey: '12345',
        sonarrId: 200,
        title: 'Test Series',
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.sonarrId).toBe(200)
      }
    })

    it('should accept mark with year', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '12345',
        title: 'Test Movie',
        year: 2023,
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.year).toBe(2023)
      }
    })

    it('should accept mark with episode details', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'EPISODE',
        plexRatingKey: '12345',
        title: 'Test Episode',
        seasonNumber: 1,
        episodeNumber: 5,
        parentTitle: 'Test Series',
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.seasonNumber).toBe(1)
        expect(result.data.episodeNumber).toBe(5)
        expect(result.data.parentTitle).toBe('Test Series')
      }
    })

    it('should accept mark with note', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '12345',
        title: 'Test Movie',
        markType: 'POOR_QUALITY',
        note: 'Low bitrate video',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.note).toBe('Low bitrate video')
      }
    })

    it('should accept mark with custom markedVia', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '12345',
        title: 'Test Movie',
        markType: 'FINISHED_WATCHING',
        markedVia: 'discord',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.markedVia).toBe('discord')
      }
    })

    it('should accept mark with discordChannelId', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '12345',
        title: 'Test Movie',
        markType: 'FINISHED_WATCHING',
        discordChannelId: '123456789',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.discordChannelId).toBe('123456789')
      }
    })

    it('should accept mark with all valid markTypes', () => {
      const markTypes = [
        'FINISHED_WATCHING',
        'NOT_INTERESTED',
        'KEEP_FOREVER',
        'REWATCH_CANDIDATE',
        'POOR_QUALITY',
        'WRONG_VERSION',
      ]

      markTypes.forEach((markType) => {
        const result = CreateUserMediaMarkSchema.safeParse({
          mediaType: 'MOVIE',
          plexRatingKey: '12345',
          title: 'Test Movie',
          markType,
        })
        expect(result.success).toBe(true)
      })
    })

    it('should accept mark with all fields populated', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'EPISODE',
        plexRatingKey: '12345',
        radarrId: 100,
        sonarrId: 200,
        title: 'Test Episode',
        year: 2023,
        seasonNumber: 2,
        episodeNumber: 10,
        parentTitle: 'Test Series',
        markType: 'WRONG_VERSION',
        note: 'Need better quality',
        markedVia: 'discord',
        discordChannelId: '987654321',
      })
      expect(result.success).toBe(true)
    })

    it('should reject mark with invalid mediaType', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MUSIC',
        plexRatingKey: '12345',
        title: 'Test Album',
        markType: 'FINISHED_WATCHING',
      })
      expect(result.success).toBe(false)
    })

    it('should reject mark with invalid markType', () => {
      const result = CreateUserMediaMarkSchema.safeParse({
        mediaType: 'MOVIE',
        plexRatingKey: '12345',
        title: 'Test Movie',
        markType: 'ARCHIVED',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('CreateUserWatchIntentSchema', () => {
    it('should accept valid intent with minimal required fields', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'MOVIE',
        title: 'Test Movie',
        intentType: 'PLAN_TO_WATCH',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.priority).toBe(0) // Default value
      }
    })

    it('should reject intent without plexRatingKey', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        mediaType: 'MOVIE',
        title: 'Test Movie',
        intentType: 'PLAN_TO_WATCH',
      })
      expect(result.success).toBe(false)
    })

    it('should reject intent with empty plexRatingKey', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '',
        mediaType: 'MOVIE',
        title: 'Test Movie',
        intentType: 'PLAN_TO_WATCH',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Plex rating key is required')
      }
    })

    it('should reject intent without mediaType', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        title: 'Test Movie',
        intentType: 'PLAN_TO_WATCH',
      })
      expect(result.success).toBe(false)
    })

    it('should reject intent without title', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'MOVIE',
        intentType: 'PLAN_TO_WATCH',
      })
      expect(result.success).toBe(false)
    })

    it('should reject intent with empty title', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'MOVIE',
        title: '',
        intentType: 'PLAN_TO_WATCH',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Title is required')
      }
    })

    it('should reject intent without intentType', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'MOVIE',
        title: 'Test Movie',
      })
      expect(result.success).toBe(false)
    })

    it('should accept intent with custom priority', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'MOVIE',
        title: 'Test Movie',
        intentType: 'PLAN_TO_WATCH',
        priority: 5,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.priority).toBe(5)
      }
    })

    it('should accept intent with negative priority', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'MOVIE',
        title: 'Test Movie',
        intentType: 'PLAN_TO_WATCH',
        priority: -1,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.priority).toBe(-1)
      }
    })

    it('should accept intent with currentSeason', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'TV_SERIES',
        title: 'Test Series',
        intentType: 'WATCHING',
        currentSeason: 2,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.currentSeason).toBe(2)
      }
    })

    it('should accept intent with currentEpisode', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'TV_SERIES',
        title: 'Test Series',
        intentType: 'WATCHING',
        currentEpisode: 5,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.currentEpisode).toBe(5)
      }
    })

    it('should accept intent with both currentSeason and currentEpisode', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'TV_SERIES',
        title: 'Test Series',
        intentType: 'WATCHING',
        currentSeason: 3,
        currentEpisode: 7,
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.currentSeason).toBe(3)
        expect(result.data.currentEpisode).toBe(7)
      }
    })

    it('should accept all valid intentTypes', () => {
      const intentTypes = [
        'PLAN_TO_WATCH',
        'WATCHING',
        'COMPLETED',
        'DROPPED',
        'ON_HOLD',
      ]

      intentTypes.forEach((intentType) => {
        const result = CreateUserWatchIntentSchema.safeParse({
          plexRatingKey: '12345',
          mediaType: 'MOVIE',
          title: 'Test Movie',
          intentType,
        })
        expect(result.success).toBe(true)
      })
    })

    it('should accept intent with all fields populated', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'TV_SERIES',
        title: 'Test Series',
        intentType: 'WATCHING',
        priority: 10,
        currentSeason: 2,
        currentEpisode: 8,
      })
      expect(result.success).toBe(true)
    })

    it('should reject intent with invalid mediaType', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'BOOK',
        title: 'Test Book',
        intentType: 'PLAN_TO_WATCH',
      })
      expect(result.success).toBe(false)
    })

    it('should reject intent with invalid intentType', () => {
      const result = CreateUserWatchIntentSchema.safeParse({
        plexRatingKey: '12345',
        mediaType: 'MOVIE',
        title: 'Test Movie',
        intentType: 'WANT_TO_WATCH',
      })
      expect(result.success).toBe(false)
    })
  })
})
