import AdmZip from 'adm-zip'
import { crc32 } from '../../patch/crc32'
import { readExpectedSourceCrc } from '../../patch/bps'

export class PatchResolutionError extends Error {}

export type DownloadKind = 'direct-bps' | 'archive' | 'unsupported'

/**
 * Classifies a mod's download link by file extension so the install
 * pipeline knows whether it can act on it automatically. See
 * docs/catalog-source-spec.md: hylianmodding.com mixes bare .bps files,
 * .zip archives, .7z archives, and plain links to a GitHub Releases page
 * under the same `download_link` field with no other signal to tell them
 * apart. .7z and anything else (including external host links) are left
 * as "unsupported" rather than guessed at.
 */
export function classifyDownloadLink(url: string): DownloadKind {
  let pathname: string
  try {
    pathname = new URL(url).pathname.toLowerCase()
  } catch {
    return 'unsupported'
  }
  if (pathname.endsWith('.bps')) return 'direct-bps'
  if (pathname.endsWith('.zip')) return 'archive'
  return 'unsupported'
}

/**
 * Given a downloaded .zip's bytes and the verified source ROM, finds the
 * .bps entry whose embedded source CRC32 matches. Deliberately doesn't
 * parse filenames for version/region hints - those aren't a standardized
 * convention across mod authors, but every BPS patch already declares
 * exactly which source ROM it expects, so checking that directly is both
 * simpler and more reliable.
 */
export function findMatchingPatchInZip(zipBuffer: Buffer, source: Buffer): Buffer {
  const zip = new AdmZip(zipBuffer)
  const bpsEntries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith('.bps'))

  if (bpsEntries.length === 0) {
    throw new PatchResolutionError('Archive does not contain any .bps patch files.')
  }

  const sourceCrc = crc32(source)

  for (const entry of bpsEntries) {
    const patchBuffer = entry.getData()
    let declaredSourceCrc: number
    try {
      declaredSourceCrc = readExpectedSourceCrc(patchBuffer)
    } catch {
      continue // not a well-formed BPS file despite the extension; skip it
    }
    if (declaredSourceCrc === sourceCrc) {
      return patchBuffer
    }
  }

  throw new PatchResolutionError(
    `None of the ${bpsEntries.length} patch(es) in this archive match your ROM ` +
      "(checked by each patch's embedded source checksum)."
  )
}
