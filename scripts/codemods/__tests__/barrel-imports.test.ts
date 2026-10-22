/**
 * The barrel codemod (P11.5): imports and object-literal mocks of the deleted
 * barrels move to the defining modules; anything else is left for review.
 */

import { transformBarrelImports } from '../barrel-imports'

describe('transformBarrelImports', () => {
  it('splits an import by defining module and keeps type modifiers', () => {
    const source = 'import { setLLMDisabled, getAdminSettings, type updateLlmCaps } from "@/actions/admin"\n'

    expect(transformBarrelImports('a.ts', source)).toEqual({
      output:
        'import { setLLMDisabled, type updateLlmCaps } from "@/actions/admin/admin-config"\n' +
        'import { getAdminSettings } from "@/lib/data/admin-settings"\n',
      reviews: [],
    })
  })

  it('splits an object-literal jest.mock and keeps its quotes', () => {
    const source = "jest.mock('@/actions/users', () => ({ getAllUsersWithWrapped: jest.fn(), unshareUserLibrary: jest.fn() }))\n"

    expect(transformBarrelImports('a.test.ts', source).output).toBe(
      "jest.mock('@/lib/data/admin-users', () => ({ getAllUsersWithWrapped: jest.fn() }))\n" +
        "jest.mock('@/actions/user-queries', () => ({ unshareUserLibrary: jest.fn() }))\n"
    )
  })

  it('leaves a namespace import and an unknown name for review, and is a no-op on a second run', () => {
    const source = 'import * as users from "@/actions/users"\nimport { mystery } from "@/actions/admin"\n'

    const result = transformBarrelImports('a.ts', source)

    expect(result.output).toBe(source)
    expect(result.reviews.map((item) => item.line)).toEqual([1, 2])
    const once = transformBarrelImports('b.ts', 'import { setUserDisabled } from "@/actions/admin"\n').output
    expect(transformBarrelImports('b.ts', once).output).toBe(once)
  })
})
