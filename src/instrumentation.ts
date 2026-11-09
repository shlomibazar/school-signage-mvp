// Runs once when the server starts (Next.js instrumentation hook).
//
// Next.js compiles this file for the Node.js and the Edge runtimes. The Node-only work lives in
// instrumentation-node.ts and is imported inside a positive NEXT_RUNTIME check, the form the bundler
// removes from the Edge build. (An early `return` for other runtimes is not removed: the Edge build
// then followed the import to node:crypto and failed with UnhandledSchemeError.)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}
