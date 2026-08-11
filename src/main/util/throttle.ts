/**
 * Leading-edge throttle: the first call goes straight through (so a UI shows
 * something immediately) and later ones wait out the interval. There is
 * deliberately no trailing call - every user of this has an authoritative
 * final value of its own (an IPC handler's return, an 'update-downloaded'
 * event), so a dropped last tick can't leave a stale progress bar.
 *
 * The clock is injectable so tests don't have to sleep.
 */
export function throttle<T>(
  emit: (value: T) => void,
  intervalMs: number,
  now: () => number = Date.now
): (value: T) => void {
  let lastEmittedAt = -Infinity

  return (value) => {
    const timestamp = now()
    if (timestamp - lastEmittedAt < intervalMs) return
    lastEmittedAt = timestamp
    emit(value)
  }
}

/**
 * Download progress fires once per chunk - hundreds of times a second on a
 * fast connection - and each call crosses the IPC boundary and re-renders.
 * Shared by the mod installer and the app updater.
 */
export const PROGRESS_EMIT_INTERVAL_MS = 200
