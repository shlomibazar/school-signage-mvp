// Runs once when the Node.js server starts (Next.js instrumentation hook).
//
// Expired people-import previews hold names and birth dates: they are cleared at start (the free
// Render instance sleeps and wakes often) and every 10 minutes while the server runs, in addition to
// the cleanup on every import request. Failures are logged by type only and never stop the server.
const CLEANUP_EVERY_MS = 10 * 60_000

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { cleanupImports } = await import('./lib/people/import/service')
  const run = () => cleanupImports().catch(e => console.error(`People import cleanup failed: ${e instanceof Error ? e.name : typeof e}`))
  void run()
  setInterval(run, CLEANUP_EVERY_MS).unref()
}
