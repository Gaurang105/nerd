// electron-vite injects MAIN_VITE_* into import.meta.env for the main process
// (baked at build time, per the ERD credentials note).
const env = import.meta.env as unknown as Record<string, string | undefined>

function required(key: string): string {
  const v = env[key]
  if (!v) console.warn(`[env] ${key} is not set — calls that need it will fail.`)
  return v ?? ''
}

export const ENV = {
  qdrantUrl: required('MAIN_VITE_QDRANT_URL'),
  qdrantApiKey: env.MAIN_VITE_QDRANT_API_KEY || undefined,
  databaseUrl: required('MAIN_VITE_DATABASE_URL'),
  openaiApiKey: required('MAIN_VITE_OPENAI_API_KEY'),
  cohereApiKey: required('MAIN_VITE_COHERE_API_KEY'),
  deepgramApiKey: required('MAIN_VITE_DEEPGRAM_API_KEY'),
  genModel: env.MAIN_VITE_GEN_MODEL || 'gpt-5.5',
  rewriteModel: env.MAIN_VITE_REWRITE_MODEL || 'gpt-5.4-mini',
  embedModel: env.MAIN_VITE_EMBED_MODEL || 'text-embedding-3-small',
  rerankModel: env.MAIN_VITE_RERANK_MODEL || 'rerank-3.5',
  transcribeModel: env.MAIN_VITE_TRANSCRIBE_MODEL || 'nova-3',
  // HyDE: embed a hypothetical answer instead of the question (better recall, +1 LLM call).
  useHyde: env.MAIN_VITE_USE_HYDE === 'true'
}

export const COLLECTION = 'nerd-chunks'
