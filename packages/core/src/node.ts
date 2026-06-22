// Node-only entry point for @agentmarkup/core.
//
// This subpath (`@agentmarkup/core/node`) carries the build-time helpers that touch
// the filesystem (`node:fs`). It is kept OUT of the main `@agentmarkup/core` entry so
// that entry stays browser-safe — the website imports validators and helpers from the
// main entry into client bundles, which must not pull in `node:fs`.
export {
  processStaticOutput,
  type ProcessMode,
  type ProcessStaticOutputOptions,
  type ProcessStaticOutputResult,
} from './process-static-output.js';
