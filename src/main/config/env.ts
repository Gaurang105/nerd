// electron-vite injects MAIN_VITE_* into import.meta.env for the main process
// (baked at build time, per the ERD credentials note).
const env = import.meta.env as unknown as Record<string, string | undefined>

function required(key: string): string {
  const v = env[key]
  if (!v) console.warn(`[env] ${key} is not set — calls that need it will fail.`)
  return v ?? ''
}

export const ENV = {
  // Single gateway service (Node + ngrok) that fronts Postgres (/sql) and Qdrant (/search).
  // The app no longer connects to either DB directly — it calls this URL.
  gatewayUrl: required('MAIN_VITE_GATEWAY_URL'),
  openaiApiKey: required('MAIN_VITE_OPENAI_API_KEY'),
  cohereApiKey: required('MAIN_VITE_COHERE_API_KEY'),
  deepgramApiKey: required('MAIN_VITE_DEEPGRAM_API_KEY'),
  genModel: env.MAIN_VITE_GEN_MODEL || 'gpt-5.5',
  rewriteModel: env.MAIN_VITE_REWRITE_MODEL || 'gpt-5.4-mini',
  embedModel: env.MAIN_VITE_EMBED_MODEL || 'text-embedding-3-small',
  rerankModel: env.MAIN_VITE_RERANK_MODEL || 'rerank-v4.0-fast',
  transcribeModel: env.MAIN_VITE_TRANSCRIBE_MODEL || 'nova-3',
  // 'multi' enables Hindi/English code-switching on nova-3; 'en' forces English-only.
  transcribeLanguage: env.MAIN_VITE_TRANSCRIBE_LANGUAGE || 'multi',
  // HyDE: embed a hypothetical answer instead of the question (better recall, +1 LLM call).
  useHyde: env.MAIN_VITE_USE_HYDE === 'true'
}

export const COLLECTION = 'nerd-chunks'
