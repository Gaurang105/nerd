import { app } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { Mode } from '@shared/types'
import { DEFAULT_SYSTEM_PROMPT } from '../services/prompts'

// A Mode's systemPrompt replaces the default generation/briefing prompt. Stored
// per-rep in modes.json (the KB stays global; Modes do not scope data sources).

function file(): string {
  return join(app.getPath('userData'), 'modes.json')
}

function read(): Mode[] {
  try {
    const modes = JSON.parse(readFileSync(file(), 'utf-8'))
    return Array.isArray(modes) ? modes : []
  } catch {
    return []
  }
}

function write(modes: Mode[]): Mode[] {
  try {
    writeFileSync(file(), JSON.stringify(modes, null, 2))
  } catch (err) {
    console.error('[modes] failed to persist', err)
  }
  return modes
}

export function listModes(): Mode[] {
  return read()
}

export function getActiveSystemPrompt(): string {
  const modes = read()
  const active = modes.find((m) => m.isDefault) ?? modes[0]
  return active?.systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT
}

export function createMode(name: string, systemPrompt: string): Mode[] {
  const modes = read()
  modes.push({ id: randomUUID(), name, systemPrompt, isDefault: modes.length === 0 })
  return write(modes)
}

export function updateMode(mode: Mode): Mode[] {
  return write(read().map((m) => (m.id === mode.id ? { ...m, ...mode } : m)))
}

export function deleteMode(id: string): Mode[] {
  const modes = read().filter((m) => m.id !== id)
  // Keep exactly one default if any modes remain.
  if (modes.length && !modes.some((m) => m.isDefault)) modes[0].isDefault = true
  return write(modes)
}

export function setActiveMode(id: string): Mode[] {
  return write(read().map((m) => ({ ...m, isDefault: m.id === id })))
}
