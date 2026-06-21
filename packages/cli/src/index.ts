export * from '@agentmarkup/core';

export {
  processStaticOutput,
  type ProcessMode,
  type ProcessStaticOutputOptions,
  type ProcessStaticOutputResult,
} from './process.js';
export {
  loadConfig,
  resolveOutDir,
  type AgentMarkupCliConfig,
  type LoadedConfig,
} from './config.js';
export { run, parseArgs } from './cli.js';
