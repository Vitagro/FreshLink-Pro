// Vercel serverless entry point: exposes the Express api-server app
// (artifacts/api-server) under /api/* without running app.listen(),
// which only works for a long-lived process and not a serverless function.
//
// Imports the pre-bundled dist/app.mjs (built by artifacts/api-server/build.mjs
// as part of the root build command) rather than the TS source: Vercel's
// function builder runs its own isolated tsc pass over this file's imports,
// which fails to resolve Express's type augmentation from the monorepo's
// workspace tsconfig. A plain bundled JS import has no types to fail on.
// @ts-expect-error no type declarations for the bundled JS output
import app from "../artifacts/api-server/dist/app.mjs"

export default app
