import {
  evaluateRuleClient,
  evaluateRuleWithDetails,
  evaluateMany,
} from '../client-evaluator'
import type { RuleCriteria, Condition, ConditionGroup } from '@/lib/validations/maintenance'

describe('client-evaluator', () => {
  // Base media item for testing
  const baseItem = {
    plexRatingKey: '12345',
    title: 'Test Movie',
    year: 2020,
    libraryId: 'lib1',
    playCount: 5,
    lastWatchedAt: new Date('2024-01-15').toISOString(),
    addedAt: new Date('2023-06-01').toISOString(),
    fileSize: 5368709120, // 5GB in bytes
    filePath: '/media/movies/test.mkv',
    resolution: '1080',
    rating: 7.5,
    genres: ['Action', 'Thriller'],
    labels: ['action', 'thriller'],
    radarr: {
      hasFile: true,
      monitored: true,
      status: 'released',
      tmdbRating: 8.1,
      tags: [1, 2, 3],
    },
  }

  describe('evaluateRuleClient', () => {
    describe('single condition evaluation', () => {
      it('should match string equals condition', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'title',
              operator: 'equals',
              value: 'Test Movie',
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should match string contains condition (case-insensitive)', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'title',
              operator: 'contains',
              value: 'test',
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should match number equals condition', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'playCount',
              operator: 'equals',
              value: 5,
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should match number greaterThan condition', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'playCount',
              operator: 'greaterThan',
              value: 3,
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should match number between condition', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'rating',
              operator: 'between',
              value: [7, 8],
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should match boolean equals condition', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'radarr.monitored',
              operator: 'equals',
              value: true,
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should match array contains condition', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'genres',
              operator: 'contains',
              value: 'Action',
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should match array containsAny condition', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'genres',
              operator: 'containsAny',
              value: ['Comedy', 'Action'],
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should match enum equals condition', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'resolution',
              operator: 'equals',
              value: '1080',
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })
    })

    describe('computed field - neverWatched', () => {
      it('should return true when playCount is 0', () => {
        const item = { ...baseItem, playCount: 0 }
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        }

        expect(evaluateRuleClient(item, criteria)).toBe(true)
      })

      it('should return false when playCount > 0', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'neverWatched',
              operator: 'equals',
              value: true,
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(false)
      })
    })

    describe('nested field access', () => {
      it('should access radarr.hasFile', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'radarr.hasFile',
              operator: 'equals',
              value: true,
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should access radarr.status', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'radarr.status',
              operator: 'equals',
              value: 'released',
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should access radarr.tmdbRating', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'radarr.tmdbRating',
              operator: 'greaterThan',
              value: 8,
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should access radarr.tags array', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'radarr.tags',
              operator: 'contains',
              value: 2,
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })
    })

    describe('date comparisons', () => {
      beforeEach(() => {
        jest.useFakeTimers()
        jest.setSystemTime(new Date('2024-06-01'))
      })

      afterEach(() => {
        jest.useRealTimers()
      })

      it('should match olderThan condition', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'lastWatchedAt',
              operator: 'olderThan',
              value: 30,
              valueUnit: 'days',
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should match newerThan condition', () => {
        const item = { ...baseItem, addedAt: new Date('2024-05-15').toISOString() }
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'addedAt',
              operator: 'newerThan',
              value: 30,
              valueUnit: 'days',
            },
          ],
        }

        expect(evaluateRuleClient(item, criteria)).toBe(true)
      })

      it('should treat null lastWatchedAt as old for olderThan', () => {
        const item = { ...baseItem, lastWatchedAt: null }
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'lastWatchedAt',
              operator: 'olderThan',
              value: 30,
              valueUnit: 'days',
            },
          ],
        }

        expect(evaluateRuleClient(item, criteria)).toBe(true)
      })
    })

    describe('null/notNull operators', () => {
      it('should match null operator when field is null', () => {
        const item = { ...baseItem, rating: null }
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'rating',
              operator: 'null',
              value: null,
            },
          ],
        }

        expect(evaluateRuleClient(item, criteria)).toBe(true)
      })

      it('should match notNull operator when field has value', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'rating',
              operator: 'notNull',
              value: null,
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })
    })

    describe('AND operator', () => {
      it('should match when all conditions are true', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'playCount',
              operator: 'greaterThan',
              value: 3,
            },
            {
              type: 'condition',
              id: 'c2',
              field: 'rating',
              operator: 'greaterThan',
              value: 7,
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should not match when one condition is false', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'playCount',
              operator: 'greaterThan',
              value: 10, // false
            },
            {
              type: 'condition',
              id: 'c2',
              field: 'rating',
              operator: 'greaterThan',
              value: 7, // true
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(false)
      })
    })

    describe('OR operator', () => {
      it('should match when at least one condition is true', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'OR',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'playCount',
              operator: 'greaterThan',
              value: 10, // false
            },
            {
              type: 'condition',
              id: 'c2',
              field: 'rating',
              operator: 'greaterThan',
              value: 7, // true
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should not match when all conditions are false', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'OR',
          conditions: [
            {
              type: 'condition',
              id: 'c1',
              field: 'playCount',
              operator: 'greaterThan',
              value: 10, // false
            },
            {
              type: 'condition',
              id: 'c2',
              field: 'rating',
              operator: 'greaterThan',
              value: 9, // false
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(false)
      })
    })

    describe('nested groups', () => {
      it('should evaluate nested AND within OR', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'OR',
          conditions: [
            {
              type: 'group',
              id: 'g1',
              operator: 'AND',
              conditions: [
                {
                  type: 'condition',
                  id: 'c1',
                  field: 'playCount',
                  operator: 'equals',
                  value: 5, // true
                },
                {
                  type: 'condition',
                  id: 'c2',
                  field: 'rating',
                  operator: 'greaterThan',
                  value: 7, // true
                },
              ],
            },
            {
              type: 'condition',
              id: 'c3',
              field: 'year',
              operator: 'equals',
              value: 2021, // false
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })

      it('should evaluate nested OR within AND', () => {
        const criteria: RuleCriteria = {
          type: 'group',
          id: 'root',
          operator: 'AND',
          conditions: [
            {
              type: 'group',
              id: 'g1',
              operator: 'OR',
              conditions: [
                {
                  type: 'condition',
                  id: 'c1',
                  field: 'playCount',
                  operator: 'equals',
                  value: 10, // false
                },
                {
                  type: 'condition',
                  id: 'c2',
                  field: 'rating',
                  operator: 'greaterThan',
                  value: 7, // true
                },
              ],
            },
            {
              type: 'condition',
              id: 'c3',
              field: 'year',
              operator: 'equals',
              value: 2020, // true
            },
          ],
        }

        expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
      })
    })
  })

  describe('evaluateRuleWithDetails', () => {
    it('should return condition results with actual and expected values', () => {
      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'c1',
            field: 'playCount',
            operator: 'equals',
            value: 5,
          },
          {
            type: 'condition',
            id: 'c2',
            field: 'rating',
            operator: 'greaterThan',
            value: 9,
          },
        ],
      }

      const result = evaluateRuleWithDetails(baseItem, criteria)

      expect(result.matches).toBe(false)
      expect(result.conditionResults).toHaveLength(2)

      expect(result.conditionResults[0]).toEqual({
        conditionId: 'c1',
        field: 'playCount',
        fieldLabel: 'Play Count',
        operator: 'equals',
        expectedValue: 5,
        actualValue: 5,
        passed: true,
      })

      expect(result.conditionResults[1]).toEqual({
        conditionId: 'c2',
        field: 'rating',
        fieldLabel: 'Rating (User)',
        operator: 'greaterThan',
        expectedValue: 9,
        actualValue: 7.5,
        passed: false,
      })
    })

    it('should collect results from nested groups', () => {
      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'group',
            id: 'g1',
            operator: 'OR',
            conditions: [
              {
                type: 'condition',
                id: 'c1',
                field: 'playCount',
                operator: 'equals',
                value: 5,
              },
            ],
          },
          {
            type: 'condition',
            id: 'c2',
            field: 'year',
            operator: 'equals',
            value: 2020,
          },
        ],
      }

      const result = evaluateRuleWithDetails(baseItem, criteria)

      expect(result.matches).toBe(true)
      expect(result.conditionResults).toHaveLength(2)
      expect(result.conditionResults.every(r => r.passed)).toBe(true)
    })
  })

  describe('evaluateMany', () => {
    const items = [
      { ...baseItem, plexRatingKey: '1', playCount: 0 },
      { ...baseItem, plexRatingKey: '2', playCount: 3 },
      { ...baseItem, plexRatingKey: '3', playCount: 0 },
      { ...baseItem, plexRatingKey: '4', playCount: 10 },
    ]

    it('should separate matching and non-matching items', () => {
      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'c1',
            field: 'neverWatched',
            operator: 'equals',
            value: true,
          },
        ],
      }

      const result = evaluateMany(items, criteria)

      expect(result.matches).toHaveLength(2)
      expect(result.nonMatches).toHaveLength(2)
      expect(result.matches.map(m => m.plexRatingKey)).toEqual(['1', '3'])
      expect(result.nonMatches.map(m => m.plexRatingKey)).toEqual(['2', '4'])
    })

    it('should handle empty items array', () => {
      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'c1',
            field: 'playCount',
            operator: 'equals',
            value: 0,
          },
        ],
      }

      const result = evaluateMany([], criteria)

      expect(result.matches).toHaveLength(0)
      expect(result.nonMatches).toHaveLength(0)
    })
  })

  describe('new Radarr/Sonarr fields', () => {
    it('should match radarr.status field', () => {
      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'c1',
            field: 'radarr.status',
            operator: 'equals',
            value: 'released',
          },
        ],
      }

      expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
    })

    it('should match radarr.tmdbRating field', () => {
      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'c1',
            field: 'radarr.tmdbRating',
            operator: 'greaterThanOrEqual',
            value: 8,
          },
        ],
      }

      expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
    })

    it('should match radarr.tags array field', () => {
      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'c1',
            field: 'radarr.tags',
            operator: 'containsAny',
            value: [1, 5, 10],
          },
        ],
      }

      expect(evaluateRuleClient(baseItem, criteria)).toBe(true)
    })

    it('should handle sonarr fields', () => {
      const tvItem = {
        ...baseItem,
        sonarr: {
          monitored: true,
          status: 'continuing',
          seriesType: 'anime',
          network: 'Netflix',
          seasonCount: 3,
          ended: false,
          tags: [1, 2],
        },
      }

      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'c1',
            field: 'sonarr.seriesType',
            operator: 'equals',
            value: 'anime',
          },
          {
            type: 'condition',
            id: 'c2',
            field: 'sonarr.seasonCount',
            operator: 'greaterThanOrEqual',
            value: 2,
          },
          {
            type: 'condition',
            id: 'c3',
            field: 'sonarr.ended',
            operator: 'equals',
            value: false,
          },
        ],
      }

      expect(evaluateRuleClient(tvItem, criteria)).toBe(true)
    })
  })

  describe('computed fields', () => {
    beforeEach(() => {
      jest.useFakeTimers()
      jest.setSystemTime(new Date('2024-06-01'))
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should compute daysSinceAdded correctly', () => {
      const item = {
        ...baseItem,
        addedAt: new Date('2024-05-01').toISOString(), // 31 days ago
      }

      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'c1',
            field: 'daysSinceAdded',
            operator: 'greaterThan',
            value: 30,
          },
        ],
      }

      expect(evaluateRuleClient(item, criteria)).toBe(true)
    })

    it('should compute daysSinceWatched correctly', () => {
      const item = {
        ...baseItem,
        lastWatchedAt: new Date('2024-05-15').toISOString(), // 17 days ago
      }

      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'c1',
            field: 'daysSinceWatched',
            operator: 'lessThan',
            value: 30,
          },
        ],
      }

      expect(evaluateRuleClient(item, criteria)).toBe(true)
    })

    it('should return null for daysSinceWatched when never watched', () => {
      const item = {
        ...baseItem,
        lastWatchedAt: null,
      }

      const criteria: RuleCriteria = {
        type: 'group',
        id: 'root',
        operator: 'AND',
        conditions: [
          {
            type: 'condition',
            id: 'c1',
            field: 'daysSinceWatched',
            operator: 'null',
            value: true,
          },
        ],
      }

      expect(evaluateRuleClient(item, criteria)).toBe(true)
    })
  })
})
