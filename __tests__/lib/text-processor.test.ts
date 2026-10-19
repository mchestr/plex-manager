import { stripHighlightTags, parseStyledText } from '@/lib/wrapped/text-processor'

describe('stripHighlightTags', () => {
  it('should remove highlight tags while preserving content', () => {
    const input = 'In 2025, you watched <highlight>23 days, 6 hours, 27 minutes</highlight> of content!'
    const expected = 'In 2025, you watched 23 days, 6 hours, 27 minutes of content!'
    expect(stripHighlightTags(input)).toBe(expected)
  })

  it('should handle multiple highlight tags', () => {
    const input = 'Your top movie was <highlight>One Battle After Another</highlight> and you binged <highlight>56</highlight> shows.'
    const expected = 'Your top movie was One Battle After Another and you binged 56 shows.'
    expect(stripHighlightTags(input)).toBe(expected)
  })

  it('should handle backward compatibility with double asterisks', () => {
    const input = 'You watched **45 days** of content!'
    const expected = 'You watched 45 days of content!'
    expect(stripHighlightTags(input)).toBe(expected)
  })

  it('should handle empty string', () => {
    expect(stripHighlightTags('')).toBe('')
  })

  it('should handle text without highlight tags', () => {
    const input = 'This is plain text without any tags.'
    expect(stripHighlightTags(input)).toBe(input)
  })

  it('should handle unclosed highlight tags', () => {
    const input = 'Text with <highlight>unclosed tag'
    // Should not crash, but behavior may vary
    expect(() => stripHighlightTags(input)).not.toThrow()
  })

  it('should handle highlight tags with empty content', () => {
    const input = 'Before<highlight></highlight>After'
    const expected = 'BeforeAfter'
    expect(stripHighlightTags(input)).toBe(expected)
  })

  it('should handle the example from the user query', () => {
    const input = 'In 2025, you watched <highlight>23 days, 6 hours, 27 minutes</highlight> of content! Your top movie was <highlight>One Battle After Another</highlight> and you binged <highlight>56</highlight> shows. What a year of entertainment!'
    const expected = 'In 2025, you watched 23 days, 6 hours, 27 minutes of content! Your top movie was One Battle After Another and you binged 56 shows. What a year of entertainment!'
    expect(stripHighlightTags(input)).toBe(expected)
  })
})

describe('parseStyledText', () => {
  it('should parse text with highlight tags', () => {
    const result = parseStyledText('Hello <highlight>world</highlight>!')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', content: 'Hello ' })
    expect(result[1]).toEqual({ type: 'highlight', content: 'world' })
    expect(result[2]).toEqual({ type: 'text', content: '!' })
  })

  it('should handle plain text', () => {
    const result = parseStyledText('Plain text')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'text', content: 'Plain text' })
  })

  it('should handle text with multiple highlights', () => {
    const result = parseStyledText('You watched <highlight>45</highlight> movies and <highlight>12</highlight> shows.')
    expect(result).toHaveLength(5)
    expect(result[0]).toEqual({ type: 'text', content: 'You watched ' })
    expect(result[1]).toEqual({ type: 'highlight', content: '45' })
    expect(result[2]).toEqual({ type: 'text', content: ' movies and ' })
    expect(result[3]).toEqual({ type: 'highlight', content: '12' })
    expect(result[4]).toEqual({ type: 'text', content: ' shows.' })
  })

  it('should handle backward compatibility with double asterisks', () => {
    const result = parseStyledText('You watched **45 days** of content!')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', content: 'You watched ' })
    expect(result[1]).toEqual({ type: 'highlight', content: '45 days' })
    expect(result[2]).toEqual({ type: 'text', content: ' of content!' })
  })

  it('should handle text starting with highlight', () => {
    const result = parseStyledText('<highlight>Hello</highlight> world')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'highlight', content: 'Hello' })
    expect(result[1]).toEqual({ type: 'text', content: ' world' })
  })

  it('should handle text ending with highlight', () => {
    const result = parseStyledText('Hello <highlight>world</highlight>')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'text', content: 'Hello ' })
    expect(result[1]).toEqual({ type: 'highlight', content: 'world' })
  })

  it('should handle empty highlight content', () => {
    const result = parseStyledText('Before<highlight></highlight>After')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', content: 'Before' })
    expect(result[1]).toEqual({ type: 'highlight', content: '' })
    expect(result[2]).toEqual({ type: 'text', content: 'After' })
  })
})
