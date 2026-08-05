import { basename, join } from 'node:path'
import { chmod, mkdir, readdir, rm, stat } from 'node:fs/promises'
import AdmZip from 'adm-zip'
import { getKnownEmulator, type EmulatorPlatform } from '@shared/emulators/registry'
import { downloadFile, type DownloadProgress } from '../download/downloadFile'
import { fetchLatestReleaseAssets, pickAsset } from './github'

export interface EmulatorInstallResult {
  ok: boolean
  executablePath: string | null
  errorMessage: string | null
}

export interface InstallKnownEmulatorInput {
  knownId: string
  platform: EmulatorPlatform
  /** Directory each installed emulator gets a subfolder under, e.g. <storageRoot>/emulators. */
  installDir: string
  onProgress?: (progress: DownloadProgress) => void
  signal?: AbortSignal
  /** Overridable for tests; defaults to the real GitHub API. */
  githubApiBaseUrl?: string
}

/**
 * An aborted fetch surfaces as an AbortError, but a signal that fires between
 * steps (after the download, before extraction) can also surface as an
 * ordinary error, so the signal itself is the more reliable half of this
 * check - same reasoning as mods/install.ts's isAbort.
 */
function isAbort(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  return err instanceof Error && err.name === 'AbortError'
}

async function findExecutable(
  dir: string,
  names: string[],
  platform: EmulatorPlatform
): Promise<string | null> {
  if (names.length === 0) return null
  const wanted = new Set(names.map((name) => (platform === 'win32' ? name.toLowerCase() : name)))

  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = await findExecutable(full, names, platform)
      if (found) return found
      continue
    }
    const compareName = platform === 'win32' ? entry.name.toLowerCase() : entry.name
    if (wanted.has(compareName)) return full
  }
  return null
}

/**
 * Downloads and installs a known emulator's latest GitHub release for
 * `platform` into its own subfolder of `installDir`, returning the resolved
 * executable path. Never throws - any failure (no download source for this
 * emulator/platform, no matching release asset, download error, or a zip
 * that doesn't contain the expected executable) resolves to `ok: false`
 * with a descriptive errorMessage, so callers don't need a try/catch for
 * the expected failure modes.
 *
 * Cancelling via `signal` is not a failure: it resolves to `ok: false` with
 * `errorMessage: null` and removes anything partially written, so the
 * picker just looks like nothing happened.
 */
export async function installKnownEmulator(
  input: InstallKnownEmulatorInput
): Promise<EmulatorInstallResult> {
  const { knownId, platform, installDir } = input
  const entry = getKnownEmulator(knownId)
  const download = entry?.download

  if (!entry || !download) {
    return {
      ok: false,
      executablePath: null,
      errorMessage: `${entry?.name ?? knownId} isn't automatically installable - download and add it manually.`
    }
  }

  const assetPattern = download.assetPattern[platform]
  const archiveType = download.archiveType[platform]
  if (!assetPattern || !archiveType) {
    return {
      ok: false,
      executablePath: null,
      errorMessage: `${entry.name} has no automatic download for this platform - add it manually.`
    }
  }

  const targetDir = join(installDir, knownId)

  try {
    const assets = await fetchLatestReleaseAssets(
      download.repo,
      input.signal,
      input.githubApiBaseUrl
    )
    const asset = pickAsset(assets, assetPattern)
    if (!asset) {
      return {
        ok: false,
        executablePath: null,
        errorMessage: `Couldn't find a matching download for ${entry.name} in its latest release.`
      }
    }

    // A clean slate each install: an earlier install's leftover files could
    // otherwise get mistaken for part of the new one by findExecutable.
    await rm(targetDir, { recursive: true, force: true })
    await mkdir(targetDir, { recursive: true })

    const assetFileName = basename(new URL(asset.downloadUrl).pathname) || asset.name
    const downloadPath = join(targetDir, assetFileName)

    await downloadFile(asset.downloadUrl, downloadPath, {
      signal: input.signal,
      onProgress: input.onProgress
    })

    let executablePath: string | null
    if (archiveType === 'zip') {
      const zip = new AdmZip(downloadPath)
      zip.extractAllTo(targetDir, true)
      await rm(downloadPath, { force: true })
      executablePath = await findExecutable(
        targetDir,
        entry.executableNames[platform] ?? [],
        platform
      )
    } else {
      executablePath = downloadPath
    }

    if (!executablePath) {
      return {
        ok: false,
        executablePath: null,
        errorMessage: `Downloaded ${entry.name} but couldn't find its executable inside the download.`
      }
    }

    // fs.access's X_OK check (used elsewhere to validate an executable path)
    // only passes on POSIX if the executable bit is actually set, and a
    // freshly-extracted or freshly-downloaded file usually doesn't have it.
    if (platform !== 'win32') {
      const current = await stat(executablePath)
      await chmod(executablePath, current.mode | 0o111)
    }

    return { ok: true, executablePath, errorMessage: null }
  } catch (err) {
    if (isAbort(err, input.signal)) {
      await rm(targetDir, { recursive: true, force: true }).catch(() => undefined)
      return { ok: false, executablePath: null, errorMessage: null }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, executablePath: null, errorMessage: message }
  }
}
