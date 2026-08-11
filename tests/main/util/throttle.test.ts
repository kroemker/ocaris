import { describe, expect, it } from 'vitest'
import { throttle } from '../../../src/main/util/throttle'

describe('throttle', () => {
  it('emits the first call immediately and drops the ones inside the interval', () => {
    let now = 0
    const seen: number[] = []
    const emit = throttle<number>(
      (value) => seen.push(value),
      200,
      () => now
    )

    emit(1)
    emit(2)
    now = 199
    emit(3)
    now = 200
    emit(4)
    now = 250
    emit(5)
    now = 400
    emit(6)

    expect(seen).toEqual([1, 4, 6])
  })

  /** No trailing emit: every caller has an authoritative final value of its
   *  own, so a dropped last tick can't leave a stale progress bar. */
  it('never emits on its own after the last call', () => {
    let now = 0
    let calls = 0
    const emit = throttle<number>(
      () => calls++,
      200,
      () => now
    )

    emit(1)
    now = 10_000
    expect(calls).toBe(1)
  })
})
