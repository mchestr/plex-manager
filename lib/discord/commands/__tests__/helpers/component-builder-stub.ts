/**
 * Recording stand-ins for discord.js's component builders (select menus,
 * buttons and action rows), for command tests that stub discord.js because
 * jsdom cannot load its REST stack. Each keeps what a test asserts on.
 */

export class StringSelectMenuBuilder {
  data: { customId?: string; placeholder?: string; options: { label: string; value: string; description?: string }[] } = { options: [] }
  setCustomId(id: string) {
    this.data.customId = id
    return this
  }
  setPlaceholder(placeholder: string) {
    this.data.placeholder = placeholder
    return this
  }
  addOptions(...options: ({ label: string; value: string; description?: string } | { label: string; value: string; description?: string }[])[]) {
    this.data.options.push(...options.flat())
    return this
  }
}

export class ButtonBuilder {
  data: { customId?: string; label?: string; style?: number } = {}
  setCustomId(id: string) {
    this.data.customId = id
    return this
  }
  setLabel(label: string) {
    this.data.label = label
    return this
  }
  setStyle(style: number) {
    this.data.style = style
    return this
  }
}

export class ActionRowBuilder {
  components: unknown[] = []
  addComponents(...components: unknown[]) {
    this.components.push(...components.flat())
    return this
  }
}

export const ButtonStyle = { Primary: 1, Secondary: 2 }
