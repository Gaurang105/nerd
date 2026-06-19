export interface SparseVector {
  indices: number[]
  values: number[]
}

const VOCAB_SIZE = 30000
const TOP_TERMS = 128

function hashTerm(term: string): number {
  let hash = 5381
  for (let i = 0; i < term.length; i++) {
    hash = ((hash << 5) + hash) ^ term.charCodeAt(i)
  }
  return Math.abs(hash) % VOCAB_SIZE
}

export function computeSparseVector(
  text: string,
  docFreqMap?: Map<string, number>,
  totalDocs?: number
): SparseVector {
  const terms = text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2)

  if (terms.length === 0) {
    return { indices: [], values: [] }
  }

  const tf = new Map<string, number>()
  for (const term of terms) {
    tf.set(term, (tf.get(term) ?? 0) + 1)
  }

  const termList = Array.from(tf.entries())
  const weights = termList.map(([term, freq]) => {
    const tfNorm = freq / terms.length
    const idf =
      docFreqMap && totalDocs ? Math.log((totalDocs + 1) / ((docFreqMap.get(term) ?? 0) + 1)) : 1.0
    return { term, score: tfNorm * idf }
  })

  weights.sort((a, b) => b.score - a.score)
  const top = weights.slice(0, TOP_TERMS)

  const indices = top.map((w) => hashTerm(w.term))
  const values = top.map((w) => w.score)

  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0)) || 1
  return { indices, values: values.map((v) => v / norm) }
}
