import { DiscordSupportStep, FinalStep, MediaRequestStep, PlexConfigurationStep, WelcomeStep } from '@/components/onboarding/onboarding-steps'

describe('Onboarding Steps Index', () => {
  describe('Exports', () => {
    it('should export WelcomeStep', () => {
      expect(WelcomeStep).toBeDefined()
      expect(typeof WelcomeStep).toBe('function')
    })

    it('should export PlexConfigurationStep', () => {
      expect(PlexConfigurationStep).toBeDefined()
      expect(typeof PlexConfigurationStep).toBe('function')
    })

    it('should export MediaRequestStep', () => {
      expect(MediaRequestStep).toBeDefined()
      expect(typeof MediaRequestStep).toBe('function')
    })

    it('should export DiscordSupportStep', () => {
      expect(DiscordSupportStep).toBeDefined()
      expect(typeof DiscordSupportStep).toBe('function')
    })

    it('should export FinalStep', () => {
      expect(FinalStep).toBeDefined()
      expect(typeof FinalStep).toBe('function')
    })
  })

  describe('Component Availability', () => {
    it('should have all step components available', () => {
      const exports = { WelcomeStep, PlexConfigurationStep, MediaRequestStep, DiscordSupportStep, FinalStep }
      const componentNames = Object.keys(exports)

      expect(componentNames).toHaveLength(5)
      expect(componentNames).toContain('WelcomeStep')
      expect(componentNames).toContain('PlexConfigurationStep')
      expect(componentNames).toContain('MediaRequestStep')
      expect(componentNames).toContain('DiscordSupportStep')
      expect(componentNames).toContain('FinalStep')
    })

    it('should export components that are React components', () => {
      expect(WelcomeStep.name).toBe('WelcomeStep')
      expect(PlexConfigurationStep.name).toBe('PlexConfigurationStep')
      expect(MediaRequestStep.name).toBe('MediaRequestStep')
      expect(DiscordSupportStep.name).toBe('DiscordSupportStep')
      expect(FinalStep.name).toBe('FinalStep')
    })
  })
})
