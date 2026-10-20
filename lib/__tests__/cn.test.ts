import { cn } from "@/lib/utils"

describe("cn", () => {
  it("keeps a design-system type step beside a text colour", () => {
    expect(cn("text-h2", "text-foreground")).toBe("text-h2 text-foreground")
    expect(cn("text-display", "text-muted-foreground")).toBe("text-display text-muted-foreground")
  })

  it("keeps only the last of two type steps", () => {
    expect(cn("text-body", "text-caption")).toBe("text-caption")
    expect(cn("text-sm", "text-stat")).toBe("text-stat")
  })

  it("keeps only the last of two text colours", () => {
    expect(cn("text-muted-foreground", "text-foreground")).toBe("text-foreground")
  })

  it("keeps only the last of two elevation shadows", () => {
    expect(cn("shadow-popover", "shadow-dialog")).toBe("shadow-dialog")
    expect(cn("shadow-poster", "shadow-none")).toBe("shadow-none")
  })

  it("treats animate-skeleton as an animation", () => {
    expect(cn("animate-spin", "animate-skeleton")).toBe("animate-skeleton")
  })
})
