/**
 * Run a stage with a per-stage timeout, chained to a parent AbortSignal.
 * The stage's own work is aborted on timeout or parent abort so a hung socket
 * can never stall the pipeline.
 */
export async function stage<T>(
  label: string,
  ms: number,
  parent: AbortSignal | undefined,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const ac = new AbortController()
  const onParentAbort = (): void => ac.abort(parent?.reason)
  if (parent) {
    if (parent.aborted) ac.abort(parent.reason)
    else parent.addEventListener('abort', onParentAbort, { once: true })
  }
  const timer = setTimeout(() => ac.abort(new Error(`${label} timed out after ${ms}ms`)), ms)
  try {
    return await fn(ac.signal)
  } finally {
    clearTimeout(timer)
    parent?.removeEventListener('abort', onParentAbort)
  }
}
