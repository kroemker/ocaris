/** Maps `items` through `fn` with at most `limit` requests in flight at once. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const current = cursor++
      results[current] = await fn(items[current], current)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))

  return results
}
