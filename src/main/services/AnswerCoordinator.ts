import type { FinalAnswer, PartialAnswer } from '@shared/types'
import { answer, type AnswerRequest } from './RAGService'
import { transcripts } from '../audio/transcriptBuffer'
import { CH } from '../ipc/channels'

type RunOptions = Omit<AnswerRequest, 'requestId' | 'signal' | 'onDelta'>

/**
 * Owns the single in-flight answer request shared by both the manual Q&A and the
 * hotkey flow. A new request aborts the prior one; late results from the aborted
 * request are dropped by request-id on the renderer.
 */
export class AnswerCoordinator {
  private current: AbortController | null = null
  private nextId = 1

  constructor(private readonly send: (channel: string, payload: unknown) => void) {}

  run(opts: RunOptions): number {
    this.current?.abort(new Error('superseded by newer request'))
    const ac = new AbortController()
    this.current = ac
    const requestId = this.nextId++

    void answer({
      ...opts,
      requestId,
      signal: ac.signal,
      onDelta: (p: PartialAnswer) => this.send(CH.answerPartial, p),
      onStatus: (s) => this.send(CH.answerStatus, s)
    }).then((final: FinalAnswer) => {
      if (this.current === ac) this.current = null
      if (final.text && !final.error) transcripts.addAnswer(final.text)
      this.send(CH.answerFinal, final)
    })

    return requestId
  }
}
