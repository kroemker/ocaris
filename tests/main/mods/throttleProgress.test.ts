import { describe, expect, it } from 'vitest'
import { throttleProgress } from '../../../src/main/mods/throttleProgress'

function progress(bytesDownloaded: number): { bytesDownloaded: number; totalBytes: number | null } {
  return { bytesDownloaded, totalBytes: 100 }
}

describe('throttleProgress', () => {
  it('emits the first call immediately and drops the ones inside the interval', () => {
    let now = 0
    const seen: number[] = []
    const emit = throttleProgress(
      (p) => seen.push(p.bytesDownloaded),
      200,
      () => now
    )

    emit(progress(1))
    emit(progress(2))
    now = 199
    emit(progress(3))
    now = 200
    emit(progress(4))
    now = 250
    emit(progress(5))
    now = 400
    emit(progress(6))

    expect(seen).toEqual([1, 4, 6])
  })

  /** No trailing emit: the install handler's return value settles the final
   *  state, so a dropped last chunk can't leave a stale progress bar. */
  it('never emits on its own after the last call', () => {
    let now = 0
    let calls = 0
    const emit = throttleProgress(
      () => calls++,
      200,
      () => now
    )

    emit(progress(1))
    now = 10_000
    expect(calls).toBe(1)
  })
})
