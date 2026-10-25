/**
 * A recording stand-in for discord.js's `SlashCommandBuilder`, for the command
 * tests that stub discord.js (jsdom cannot load its REST stack). Importing any
 * command builds every definition (`definitions.ts`), so the stub covers what
 * all of them call: name, description, string options and subcommands.
 */

class SlashCommandStringOption {
  name = ""
  description = ""
  required = false
  autocomplete = false
  choices: { name: string; value: string }[] = []
  setName(name: string) {
    this.name = name
    return this
  }
  setDescription(description: string) {
    this.description = description
    return this
  }
  setRequired(required: boolean) {
    this.required = required
    return this
  }
  setAutocomplete(autocomplete: boolean) {
    this.autocomplete = autocomplete
    return this
  }
  addChoices(...choices: { name: string; value: string }[]) {
    this.choices.push(...choices)
    return this
  }
}

class SlashCommandSubcommandBuilder {
  name = ""
  description = ""
  options: SlashCommandStringOption[] = []
  setName(name: string) {
    this.name = name
    return this
  }
  setDescription(description: string) {
    this.description = description
    return this
  }
  addStringOption(fn: (option: SlashCommandStringOption) => SlashCommandStringOption) {
    this.options.push(fn(new SlashCommandStringOption()))
    return this
  }
}

export class SlashCommandBuilder extends SlashCommandSubcommandBuilder {
  subcommands: SlashCommandSubcommandBuilder[] = []
  addSubcommand(fn: (sub: SlashCommandSubcommandBuilder) => SlashCommandSubcommandBuilder) {
    this.subcommands.push(fn(new SlashCommandSubcommandBuilder()))
    return this
  }
}
