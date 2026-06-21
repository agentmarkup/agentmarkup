#!/usr/bin/env node
import { createRequire } from 'node:module';
import { run } from './cli.js';

function resolveVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json') as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

run(process.argv.slice(2), { version: resolveVersion() })
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `agentmarkup: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  });
