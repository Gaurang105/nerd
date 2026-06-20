import type { AnticipatedQuestion, BriefingResult } from '@shared/types'
import { embed, generateJSON } from './openai'
import { searchChunks } from './qdrant'
import { rerank } from './rerank'
import { contextBlock, BRIEFING_SYSTEM_PROMPT } from './prompts'
import { getActiveSystemPrompt } from '../mode/ModeService'
import { getLastSync } from './db'
import { timeAgo } from '../util/timeAgo'

interface BriefingJSON {
  briefing: string
  anticipatedQuestions: AnticipatedQuestion[]
}

export async function runBriefing(
  description: string,
  signal?: AbortSignal
): Promise<BriefingResult> {
  const vector = await embed(description, signal)
  const raw = await searchChunks(vector, 40)
  // Typed description is already clean; rerank still narrows the candidate pool.
  const chunks = await rerank(description, raw, signal)

  // A Mode (if set) replaces the default persona; the briefing task framing is appended.
  const system = `${getActiveSystemPrompt()}\n\n${BRIEFING_SYSTEM_PROMPT}`
  const user = `MEETING DESCRIPTION:\n${description}\n\nCONTEXT:\n${contextBlock(chunks)}`

  let parsed: BriefingJSON = { briefing: '', anticipatedQuestions: [] }
  try {
    parsed = await generateJSON<BriefingJSON>(system, user, signal)
  } catch (err) {
    console.error('[briefing] generation failed', err)
    parsed.briefing = 'Context unavailable — could not generate a briefing.'
  }

  return {
    briefing: parsed.briefing || '',
    anticipatedQuestions: parsed.anticipatedQuestions ?? [],
    contextAge: timeAgo(await getLastSync()),
    sourcesLoaded: chunks.length
  }
}
