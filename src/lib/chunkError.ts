// A JS chunk that fails to load (seen in production during a deploy: a page from the previous
// build asked for files the new instance no longer serves, answered 503). Re-rendering or
// refreshing the data cannot fix it; only a full page load (current HTML and files) can.
export function isChunkLoadError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null
  return e?.name === 'ChunkLoadError' || /Loading (CSS )?chunk [\w-]+ failed|Failed to fetch dynamically imported module/i.test(e?.message ?? '')
}
