import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Mode } from '@nerd/shared'

const DEFAULT_MODES: Mode[] = [
  {
    id: 'default-terse',
    name: 'Terse (exec)',
    systemPrompt: `You are Nerd, a real-time assistant for a Headout employee on a live call.
Answer the question implied by the conversation. Be extremely concise — 1-3 bullet points max.
Lead with the exact number or fact. Cite sources inline. If a Headout-specific fact is not in CONTEXT or SCREEN, say "check with ops" — never invent it.`,
    isDefault: true
  },
  {
    id: 'default-verbose',
    name: 'Verbose (junior)',
    systemPrompt: `You are Nerd, a real-time assistant for a Headout employee on a live call.
Answer the question implied by the conversation in clear, conversational prose ready to speak aloud.
Use the CONTEXT, SCREEN, and your own knowledge. Cite sources. If a Headout-specific fact is missing, say so clearly.`,
    isDefault: false
  }
]

interface PersistedState {
  modes: Mode[]
  activeModeId: string
}

export class ModeService {
  private readonly path: string
  private modes: Mode[]
  private activeModeId: string

  constructor() {
    this.path = join(app.getPath('userData'), 'nerd-modes.json')
    const loaded = this.load()
    this.modes = loaded.modes
    this.activeModeId = loaded.activeModeId
  }

  listModes(): Mode[] {
    return this.modes
  }

  getActiveMode(): Mode {
    return this.modes.find((m) => m.id === this.activeModeId) ?? this.modes[0]
  }

  setActiveMode(id: string): void {
    this.activeModeId = id
    this.persist()
  }

  createMode(name: string, systemPrompt: string): Mode {
    const mode: Mode = {
      id: randomUUID(),
      name,
      systemPrompt,
      isDefault: false
    }
    this.modes.push(mode)
    this.persist()
    return mode
  }

  updateMode(
    id: string,
    updates: Partial<Pick<Mode, 'name' | 'systemPrompt' | 'isDefault'>>
  ): Mode {
    const mode = this.modes.find((m) => m.id === id)
    if (!mode) throw new Error(`Mode not found: ${id}`)

    if (updates.isDefault === true) {
      for (const m of this.modes) m.isDefault = false
    }
    Object.assign(mode, updates)
    this.persist()
    return mode
  }

  deleteMode(id: string): void {
    if (this.modes.length <= 1) throw new Error('Cannot delete the last remaining mode')
    this.modes = this.modes.filter((m) => m.id !== id)
    if (this.activeModeId === id) {
      this.activeModeId = this.modes[0].id
    }
    this.persist()
  }

  getActiveSystemPrompt(): string {
    return this.getActiveMode().systemPrompt
  }

  private persist(): void {
    try {
      const state: PersistedState = { modes: this.modes, activeModeId: this.activeModeId }
      writeFileSync(this.path, JSON.stringify(state, null, 2), 'utf8')
    } catch (err) {
      console.error('[ModeService] failed to persist modes', err)
    }
  }

  private load(): PersistedState {
    if (!existsSync(this.path)) {
      const seeded: PersistedState = {
        modes: [...DEFAULT_MODES],
        activeModeId: DEFAULT_MODES.find((m) => m.isDefault)?.id ?? DEFAULT_MODES[0].id
      }
      try {
        writeFileSync(this.path, JSON.stringify(seeded, null, 2), 'utf8')
      } catch (err) {
        console.error('[ModeService] failed to seed modes file', err)
      }
      return seeded
    }
    try {
      const raw = readFileSync(this.path, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedState>
      const modes = parsed.modes && parsed.modes.length > 0 ? parsed.modes : [...DEFAULT_MODES]
      const activeModeId =
        parsed.activeModeId && modes.some((m) => m.id === parsed.activeModeId)
          ? parsed.activeModeId
          : (modes.find((m) => m.isDefault)?.id ?? modes[0].id)
      return { modes, activeModeId }
    } catch (err) {
      console.error('[ModeService] failed to load modes, using defaults', err)
      return {
        modes: [...DEFAULT_MODES],
        activeModeId: DEFAULT_MODES.find((m) => m.isDefault)?.id ?? DEFAULT_MODES[0].id
      }
    }
  }
}
