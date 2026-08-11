import { useCallback, useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/ipc'

const INITIAL: UpdateStatus = {
  state: 'idle',
  version: null,
  releaseNotes: null,
  percent: null,
  transferredBytes: null,
  totalBytes: null,
  message: null
}

export interface UpdateStatusHandle {
  status: UpdateStatus
  check: () => void
  download: () => void
  install: () => void
}

/**
 * Subscribes to the update state machine main owns.
 *
 * Unlike useUiState, this can safely be called from more than one component:
 * it only reads, main broadcasts every change to every listener, and the three
 * actions are requests rather than local state - so the banner and the
 * Settings pane can each hold one and stay in agreement.
 */
export function useUpdateStatus(): UpdateStatusHandle {
  const [status, setStatus] = useState<UpdateStatus>(INITIAL)

  useEffect(() => {
    void window.api.update.getStatus().then(setStatus)
    // The status can change without this window asking - the check on launch,
    // or the other half of the UI pressing Download.
    return window.api.update.onStatus(setStatus)
  }, [])

  const check = useCallback(() => void window.api.update.check().then(setStatus), [])
  const download = useCallback(() => void window.api.update.download().then(setStatus), [])
  const install = useCallback(() => void window.api.update.install(), [])

  return { status, check, download, install }
}
