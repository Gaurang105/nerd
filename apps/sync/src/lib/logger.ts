export const log = {
  info: (msg: string, data?: Record<string, unknown>): void =>
    console.log(JSON.stringify({ level: 'info', msg, ...data, ts: Date.now() })),
  error: (msg: string, err?: unknown, data?: Record<string, unknown>): void =>
    console.error(
      JSON.stringify({ level: 'error', msg, err: String(err), ...data, ts: Date.now() })
    ),
  warn: (msg: string, data?: Record<string, unknown>): void =>
    console.warn(JSON.stringify({ level: 'warn', msg, ...data, ts: Date.now() }))
}
