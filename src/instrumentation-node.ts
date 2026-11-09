// Node.js-only startup work, loaded by instrumentation.ts inside its NEXT_RUNTIME === 'nodejs' block
// (never part of the Edge build, which cannot bundle node: modules such as node:crypto).
//
// Expired people-import previews hold names and birth dates: they are cleared at start (the free
// Render instance sleeps and wakes often) and every 10 minutes while the server runs, in addition to
// the cleanup on every import request. Failures are logged by type only and never stop the server.
import { cleanupImports } from './lib/people/import/service'

const CLEANUP_EVERY_MS = 10 * 60_000

const run = () => cleanupImports().catch(e => console.error(`People import cleanup failed: ${e instanceof Error ? e.name : typeof e}`))
void run()
setInterval(run, CLEANUP_EVERY_MS).unref()
