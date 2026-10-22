import { warmVisibleStyle } from '../warm-style'

describe('warmVisibleStyle', () => {
  afterEach(() => jest.restoreAllMocks())

  it('reads the page as visible once and leaves it veiled', () => {
    document.body.innerHTML = '<article class="rw-page invisible"><h2>412</h2></article>'
    const article = document.querySelector('article')!
    const seen: boolean[] = []
    const read = jest.spyOn(window, 'getComputedStyle').mockImplementation((el) => {
      seen.push((el as Element).classList.contains('invisible'))
      return {} as CSSStyleDeclaration
    })

    warmVisibleStyle(article)

    expect(read).toHaveBeenCalledWith(article)
    expect(seen).toEqual([false])
    expect(article.className).toBe('rw-page invisible')
  })

  it('leaves a page that is not veiled alone', () => {
    document.body.innerHTML = '<article class="rw-page"></article>'
    const article = document.querySelector('article')!
    const read = jest.spyOn(window, 'getComputedStyle')

    warmVisibleStyle(article)

    expect(read).not.toHaveBeenCalled()
    expect(article.className).toBe('rw-page')
  })
})
