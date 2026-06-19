import assert from 'node:assert'
import { remapBounds, type Rect } from './displayFollow'

// Runnable self-check for cross-display remapping. Run: npx tsx <thisfile>

const MARGIN = 16

// 1) Same-size displays: a top-right window keeps the identical offset/margin.
{
  const from: Rect = { x: 0, y: 0, width: 1920, height: 1080 }
  const to: Rect = { x: 1920, y: 0, width: 1920, height: 1080 }
  const b: Rect = { x: 1920 - 420 - MARGIN, y: MARGIN, width: 420, height: 560 }
  const r = remapBounds(b, from, to, MARGIN)
  assert.strictEqual(r.x, 1920 + (1920 - 420 - MARGIN), 'top-right keeps same x offset on next display')
  assert.strictEqual(r.y, MARGIN, 'top margin preserved')
}

// 2) Different-size display: right-edge window stays pinned near the right edge.
{
  const from: Rect = { x: 0, y: 0, width: 1920, height: 1080 }
  const to: Rect = { x: 1920, y: 0, width: 1280, height: 800 }
  const b: Rect = { x: 1920 - 420 - MARGIN, y: MARGIN, width: 420, height: 560 }
  const r = remapBounds(b, from, to, MARGIN)
  const rightGap = to.x + to.width - (r.x + b.width)
  assert.ok(rightGap >= 0 && rightGap <= MARGIN + 1, `stays within margin of right edge (gap=${rightGap})`)
}

// 3) Oversized window: result is always clamped within the target work area.
{
  const from: Rect = { x: 0, y: 0, width: 1920, height: 1080 }
  const to: Rect = { x: 0, y: 0, width: 400, height: 300 }
  const b: Rect = { x: 1500, y: 900, width: 600, height: 500 }
  const r = remapBounds(b, from, to, MARGIN)
  assert.ok(r.x >= to.x, 'x not left of target')
  assert.ok(r.y >= to.y, 'y not above target')
  assert.ok(r.x <= to.x + to.width, 'x not right of target')
  assert.ok(r.y <= to.y + to.height, 'y not below target')
}

console.log('displayFollow self-check passed')
