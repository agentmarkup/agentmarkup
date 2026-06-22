// The flat-directory processor now lives in @agentmarkup/core's Node-only entry
// (`@agentmarkup/core/node`), shared with @agentmarkup/cli. It is kept out of core's
// main entry so that entry stays browser-safe. Re-exported here to preserve this
// package's public API surface and internal imports.
export {
  processStaticOutput,
  type ProcessMode,
  type ProcessStaticOutputOptions,
  type ProcessStaticOutputResult,
} from '@agentmarkup/core/node';
