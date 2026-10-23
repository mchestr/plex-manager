import {
  nextStepId,
  OPTIONAL_SETUP_STEP_IDS,
  parseSetupPosition,
  previousStepId,
  SETUP_STEPS,
  stepIndex,
} from '@/types/setup'

describe('SETUP_STEPS (P10.24)', () => {
  it('lists the steps in the grouped order', () => {
    expect(SETUP_STEPS.map((step) => step.id)).toEqual([
      'plex',
      'tautulli',
      'overseerr',
      'sonarr',
      'radarr',
      'llm-rewind',
      'llm-chat',
      'discord',
      'prometheus',
    ])
  })

  it('groups them as the design draws the stepper', () => {
    expect(SETUP_STEPS.map((step) => [step.id, step.group])).toEqual([
      ['plex', 'Core'],
      ['tautulli', 'Core'],
      ['overseerr', 'Requests'],
      ['sonarr', 'Automation'],
      ['radarr', 'Automation'],
      ['llm-rewind', 'AI'],
      ['llm-chat', 'AI'],
      ['discord', 'Community and monitoring'],
      ['prometheus', 'Community and monitoring'],
    ])
  })

  it('makes only Plex and Tautulli required, and Skip accepts exactly the others', () => {
    expect(SETUP_STEPS.filter((step) => !step.optional).map((step) => step.id)).toEqual(['plex', 'tautulli'])
    expect([...OPTIONAL_SETUP_STEP_IDS]).toEqual(SETUP_STEPS.filter((step) => step.optional).map((step) => step.id))
  })
})

describe('step navigation', () => {
  it('goes from one step to the next, and from the last to the summary', () => {
    expect(nextStepId('plex')).toBe('tautulli')
    expect(nextStepId('radarr')).toBe('llm-rewind')
    expect(nextStepId('llm-rewind')).toBe('llm-chat')
    expect(nextStepId('prometheus')).toBe('summary')
  })

  it('goes back one step, with nothing before Plex', () => {
    expect(previousStepId('plex')).toBeNull()
    expect(previousStepId('tautulli')).toBe('plex')
    expect(previousStepId('summary')).toBe('prometheus')
  })

  it('indexes positions from Plex to the summary', () => {
    expect(stepIndex('plex')).toBe(0)
    expect(stepIndex('prometheus')).toBe(8)
    expect(stepIndex('summary')).toBe(9)
  })

  it('parses only known positions', () => {
    expect(parseSetupPosition('discord')).toBe('discord')
    expect(parseSetupPosition('summary')).toBe('summary')
    expect(parseSetupPosition('7')).toBeNull()
    expect(parseSetupPosition(['plex'])).toBeNull()
    expect(parseSetupPosition(undefined)).toBeNull()
  })
})
