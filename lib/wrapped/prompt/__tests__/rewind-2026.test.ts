import { buildFactSheet } from '@/lib/wrapped/facts/fact-sheet'
import { styleGuideSchema } from '@/lib/validations/prompt'
import { PROMPT_VERSION, systemPrompt, userPrompt } from '@/lib/wrapped/prompt/rewind-2026'

describe('the Rewind 2026 prompt (P5.9)', () => {
  it('is version rewind-2026.1', () => {
    expect(PROMPT_VERSION).toBe('rewind-2026.1')
  })

  it('keeps the system block byte-stable (snapshot): change it only with a new PROMPT_VERSION', () => {
    expect(systemPrompt(null)).toMatchSnapshot()
  })

  it('holds no member data or timestamps', () => {
    const system = systemPrompt(null)
    expect(system).not.toMatch(/\b20\d\d-\d\d-\d\d|@|example\.com/)
    expect(system).toContain('{{fact:<id>}}')
  })

  it('appends the style guide last, so the frozen prefix stays cacheable', () => {
    const base = systemPrompt(null)
    const styled = systemPrompt('Use British spelling.')
    expect(styled.startsWith(base)).toBe(true)
    expect(styled.endsWith('Use British spelling.')).toBe(true)
  })

  it('refuses a style guide over 1,200 characters or with placeholders', () => {
    expect(styleGuideSchema.safeParse('a'.repeat(1200)).success).toBe(true)
    expect(styleGuideSchema.safeParse('a'.repeat(1201)).success).toBe(false)
    expect(styleGuideSchema.safeParse('Hello {{userName}}').success).toBe(false)
  })

  it('carries only the requested facts, the slots, the archetype rule and the titles in the user block', () => {
    const facts = {
      'series[1].title': { value: 'Severance', display: 'Severance', unit: 'title' as const },
      'hours.afterDarkShare': { value: 0.34, display: '34%', unit: 'share' as const },
      'member.firstName': { value: 'Mike', display: 'Mike', unit: 'name' as const },
    }
    const prompt = userPrompt({
      factSheet: buildFactSheet(facts, ['series[1].title', 'hours.afterDarkShare']),
      slots: ['deck.clock', 'deck.topShows'],
      archetype: { id: 'midnight-marathoner', shortlist: ['midnight-marathoner', 'loyalist'], mayChoose: true },
    })
    expect(prompt).toContain('"deck.clock":["hours.afterDarkShare"]')
    expect(prompt).toContain('or choose one of midnight-marathoner, loyalist')
    expect(prompt).toContain('Titles (always as tokens): ["Severance"]')
    expect(prompt).not.toContain('Mike')
  })
})
