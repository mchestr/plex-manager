import { parseStyledText } from '@/lib/wrapped/text-processor'

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
