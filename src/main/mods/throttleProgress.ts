import type { DownloadProgress } from '../download/downloadFile'

/**
 * Download progress fires once per chunk - hundreds of times a second on a
 * fast connection - and each call crosses the IPC boundary and re-renders a
 * row. This drops the ones in between.
 */
export const PROGRESS_EMIT_INTERVAL_MS = 200

/**
 * Leading-edge throttle: the first call goes straight through (so a row shows
 * something immediately) and later ones wait out the interval. There is
 * deliberately no trailing call - the install handler's return value is what
 * settles the final state, so a dropped last chunk can't leave a stale bar.
 */
export function throttleProgress(
  emit: (progress: DownloadProgress) => void,
  intervalMs = PROGRESS_EMIT_INTERVAL_MS,
  now: () => number = Date.now
): (progress: DownloadProgress) => void {
  let lastEmittedAt = -Infinity

  return (progress) => {
    const timestamp = now()
    if (timestamp - lastEmittedAt < intervalMs) return
    lastEmittedAt = timestamp
    emit(progress)
  }
}
