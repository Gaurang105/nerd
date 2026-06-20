import { useEffect, type RefObject } from 'react'

/**
 * Drives the native window size from rendered content: observes the element and
 * reports its height to main, which resizes the window to fit. Pass `width` to
 * force a width (e.g. Settings = 600); `null` keeps the user's current width.
 */
export function useFitWindow(ref: RefObject<HTMLElement | null>, width: number | null): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const report = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => void window.nerd.setContentSize(width, el.offsetHeight))
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [ref, width])
}
