import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type { SupabaseClient }

export interface SupabaseClientConfig {
  url: string
  key: string
}

export function createSupabaseClient(cfg: SupabaseClientConfig): SupabaseClient {
  return createClient(cfg.url, cfg.key)
}
