import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { DEFAULT_APPEARANCE, type Settings } from '@shared/types'

// ponytail: a single JSON file in userData instead of pulling in electron-store.
// Ceiling: synchronous read/write, fine for a tiny settings blob written on debounce.
// Upgrade path: swap to async fs or electron-store if settings grow large.

const DEFAULTS: Settings = {
  appearance: DEFAULT_APPEARANCE,
  bounds: null,
  hidden: true,
  format: 'list'
}

let cache: Settings | null = null

function file(): string {
  return join(app.getPath('userData'), 'nerd-settings.json')
}

export function loadSettings(): Settings {
  if (cache) return cache
  let next: Settings
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf-8'))
    next = { ...DEFAULTS, ...raw, appearance: { ...DEFAULT_APPEARANCE, ...raw.appearance } }
  } catch {
    next = { ...DEFAULTS }
  }
  cache = next
  return next
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  cache = next
  try {
    writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch (err) {
    console.error('[store] failed to persist settings', err)
  }
  return next
}
