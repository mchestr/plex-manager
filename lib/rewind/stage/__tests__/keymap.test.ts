import { keyToCommand } from "../keymap"

function element(html: string, selector: string): Element {
  document.body.innerHTML = html
  const el = document.querySelector(selector)
  if (!el) throw new Error(`no ${selector}`)
  return el
}

const stage = () => element('<section tabindex="-1" id="s"></section>', "#s")

describe("keyToCommand", () => {
  it.each([
    ["ArrowRight", "next"],
    ["PageDown", "next"],
    ["ArrowLeft", "prev"],
    ["PageUp", "prev"],
    ["Home", "first"],
    ["End", "last"],
    [" ", "toggle-play"],
    ["Escape", "escape"],
    ["Enter", "choose"],
  ])("%j always works, shortcuts off: %s", (key, command) => {
    expect(keyToCommand({ key, target: stage() }, { shortcuts: false })).toBe(command)
  })

  it("maps the letter keys only while shortcuts are on", () => {
    for (const key of ["k", "K", "s", "t", ","]) {
      expect(keyToCommand({ key, target: stage() }, { shortcuts: false })).toBeNull()
    }
    expect(keyToCommand({ key: "k", target: stage() }, { shortcuts: true })).toBe("toggle-play")
    expect(keyToCommand({ key: "S", target: stage() }, { shortcuts: true })).toBe("share")
    expect(keyToCommand({ key: "t", target: stage() }, { shortcuts: true })).toBe("table")
    expect(keyToCommand({ key: ",", target: stage() }, { shortcuts: true })).toBe("settings")
  })

  it("ignores keys typed in a text field", () => {
    const input = element('<input id="i" />', "#i")
    expect(keyToCommand({ key: "ArrowRight", target: input }, { shortcuts: true })).toBeNull()
    expect(keyToCommand({ key: "k", target: input }, { shortcuts: true })).toBeNull()
    expect(keyToCommand({ key: "Escape", target: input }, { shortcuts: true })).toBeNull()
  })

  it("ignores keys inside a sheet", () => {
    const button = element('<div role="dialog"><button id="b">Close</button></div>', "#b")
    expect(keyToCommand({ key: "Escape", target: button }, { shortcuts: true })).toBeNull()
  })

  it("leaves Space to a focused button, and everything but Esc to an interactive island", () => {
    const button = element('<button id="b">Pause</button>', "#b")
    expect(keyToCommand({ key: " ", target: button }, { shortcuts: true })).toBeNull()
    expect(keyToCommand({ key: "Enter", target: button }, { shortcuts: true })).toBeNull()
    expect(keyToCommand({ key: "ArrowRight", target: button }, { shortcuts: true })).toBe("next")

    const radio = element('<div data-rw-interactive><div role="radio" id="r"></div></div>', "#r")
    expect(keyToCommand({ key: "ArrowRight", target: radio }, { shortcuts: true })).toBeNull()
    expect(keyToCommand({ key: "Escape", target: radio }, { shortcuts: true })).toBe("escape")
  })

  it("leaves modified keys to the browser", () => {
    expect(keyToCommand({ key: "ArrowLeft", target: stage(), altKey: true }, { shortcuts: true })).toBeNull()
    expect(keyToCommand({ key: "k", target: stage(), metaKey: true }, { shortcuts: true })).toBeNull()
  })

  it("leaves the scroll keys to the desktop rail and Notes, but not the letters or Esc", () => {
    const notes = element('<aside data-rw-scroll><p id="n" tabindex="-1">Notes</p></aside>', "#n")
    for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "PageDown", "Home", "End", " "]) {
      expect(keyToCommand({ key, target: notes }, { shortcuts: true })).toBeNull()
    }
    expect(keyToCommand({ key: "t", target: notes }, { shortcuts: true })).toBe("table")
    expect(keyToCommand({ key: "Escape", target: notes }, { shortcuts: true })).toBe("escape")
  })
})
