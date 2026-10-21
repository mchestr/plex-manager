import { completeRunning } from '../running-animations'

interface FakeAnimation {
  playState: AnimationPlayState
  effect: { target: Element; getComputedTiming: () => { endTime: number } }
  finish: jest.Mock
}

function animation(target: Element, { playState = 'running', endTime = 900 }: { playState?: AnimationPlayState; endTime?: number } = {}): FakeAnimation {
  const fake: FakeAnimation = {
    playState,
    effect: { target, getComputedTiming: () => ({ endTime }) },
    finish: jest.fn(() => {
      fake.playState = 'finished'
    }),
  }
  return fake
}

/** A page whose `getAnimations` returns what is still running, as a browser's would. */
function page(build: (article: HTMLElement) => FakeAnimation[]) {
  document.body.innerHTML = '<article><h2 class="rw-rise">412</h2><div class="rw-progress"></div></article>'
  const article = document.querySelector('article')!
  const animations = build(article)
  Object.defineProperty(article, 'getAnimations', { value: () => animations, configurable: true })
  return { article, animations }
}

describe('completeRunning', () => {
  it('finishes the running count-up and says so, then has nothing left', () => {
    const { article, animations } = page((a) => [animation(a.querySelector('h2')!)])
    expect(completeRunning(article)).toBe(true)
    expect(animations[0].finish).toHaveBeenCalledTimes(1)
    expect(completeRunning(article)).toBe(false)
  })

  it('never finishes the progress bar', () => {
    const { article, animations } = page((a) => [animation(a.querySelector('.rw-progress')!)])
    expect(completeRunning(article)).toBe(false)
    expect(animations[0].finish).not.toHaveBeenCalled()
  })

  it('leaves paused, finished and endless animations alone', () => {
    const { article, animations } = page((a) => {
      const h2 = a.querySelector('h2')!
      return [animation(h2, { playState: 'paused' }), animation(h2, { playState: 'finished' }), animation(h2, { endTime: Infinity })]
    })
    expect(completeRunning(article)).toBe(false)
    animations.forEach((a) => expect(a.finish).not.toHaveBeenCalled())
  })

  it('does nothing without a page or without getAnimations', () => {
    expect(completeRunning(null)).toBe(false)
    expect(completeRunning(document.createElement('article'))).toBe(false)
  })
})
