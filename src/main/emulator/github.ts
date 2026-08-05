export class GithubReleaseError extends Error {}

export interface GithubReleaseAsset {
  name: string
  downloadUrl: string
}

interface GithubReleaseAssetJson {
  name: string
  browser_download_url: string
}

interface GithubReleaseJson {
  assets: GithubReleaseAssetJson[]
}

/**
 * Fetches the asset list of a GitHub repo's latest release. A User-Agent is
 * required by GitHub's API or every request gets a 403, regardless of the
 * repo being public.
 */
export async function fetchLatestReleaseAssets(
  repo: string,
  signal?: AbortSignal,
  apiBaseUrl = 'https://api.github.com'
): Promise<GithubReleaseAsset[]> {
  const url = `${apiBaseUrl}/repos/${repo}/releases/latest`

  let response: Response
  try {
    response = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ocaris-emulator-installer'
      }
    })
  } catch (err) {
    if (signal?.aborted) {
      throw new GithubReleaseError('Cancelled.')
    }
    throw new GithubReleaseError(`Failed to reach ${url}: ${(err as Error).message}`)
  }

  if (!response.ok) {
    throw new GithubReleaseError(
      `Failed to fetch latest release for ${repo}: HTTP ${response.status}`
    )
  }

  const json = (await response.json()) as GithubReleaseJson
  return json.assets.map((asset) => ({
    name: asset.name,
    downloadUrl: asset.browser_download_url
  }))
}

/** Returns the first asset whose name matches `pattern`, or undefined if none do. */
export function pickAsset(
  assets: GithubReleaseAsset[],
  pattern: RegExp
): GithubReleaseAsset | undefined {
  return assets.find((asset) => pattern.test(asset.name))
}
