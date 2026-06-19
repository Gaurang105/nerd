// ponytail: mirrors electron.Rectangle but kept local so this file stays Electron-free
// and the self-check can run under plain tsx without the electron binary.
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)

// Remap a window rect from one display work area onto another, preserving its
// relative position (so a top-right snap stays top-right, a free-dragged spot
// stays proportionally placed). Result is clamped to keep the window on-screen
// with `margin` breathing room. Pure (no electron) so it can run under tsx.
export function remapBounds(b: Rect, from: Rect, to: Rect, margin: number): { x: number; y: number } {
  const relX = clamp((b.x - from.x) / Math.max(1, from.width - b.width), 0, 1)
  const relY = clamp((b.y - from.y) / Math.max(1, from.height - b.height), 0, 1)

  const rawX = to.x + relX * Math.max(0, to.width - b.width)
  const rawY = to.y + relY * Math.max(0, to.height - b.height)

  // Lower bound never exceeds upper bound even when the window is wider/taller
  // than the target display (clamp ranges stay valid).
  const maxX = to.x + Math.max(0, to.width - b.width - margin)
  const maxY = to.y + Math.max(0, to.height - b.height - margin)

  return {
    x: Math.round(clamp(rawX, to.x + margin, Math.max(to.x + margin, maxX))),
    y: Math.round(clamp(rawY, to.y + margin, Math.max(to.y + margin, maxY)))
  }
}
