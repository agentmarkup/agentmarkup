import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AgentMarkupConfig } from '@agentmarkup/core';

/**
 * CLI-only config envelope. `outDir` is metadata consumed by the CLI for path
 * resolution and is never forwarded into core, which is build-tool-agnostic and
 * has no such field.
 */
export interface AgentMarkupCliConfig extends AgentMarkupConfig {
  outDir?: string;
}

type ConfigModuleExport =
  | AgentMarkupCliConfig
  | (() => AgentMarkupCliConfig | Promise<AgentMarkupCliConfig>);

/** Config file names probed in the working directory when `--config` is omitted. */
const DEFAULT_CONFIG_FILES = [
  'agentmarkup.config.mjs',
  'agentmarkup.config.js',
  'agentmarkup.config.cjs',
];

/** Build output directories guessed when no `outDir` is given. `public/` is never guessed. */
const DEFAULT_OUTPUT_DIRS = ['dist', 'build', 'out', '_site'];

export interface LoadedConfig {
  config: AgentMarkupConfig;
  outDir?: string;
  configFile: string;
}

export async function loadConfig(options: {
  configPath?: string;
  cwd: string;
}): Promise<LoadedConfig> {
  const configFile = resolveConfigFile(options.configPath, options.cwd);
  if (!configFile) {
    throw new Error(
      options.configPath
        ? `Config file not found: ${options.configPath}`
        : `No agentmarkup config found in ${options.cwd}. Expected one of: ${DEFAULT_CONFIG_FILES.join(', ')}, or pass --config <path>.`
    );
  }

  let imported: { default?: ConfigModuleExport } & Record<string, unknown>;
  try {
    imported = await import(pathToFileURL(configFile).href);
  } catch (error) {
    throw new Error(
      `Failed to load config ${configFile}: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const exported = (imported.default ?? imported) as ConfigModuleExport;
  const resolved =
    typeof exported === 'function'
      ? await (exported as () => AgentMarkupCliConfig | Promise<AgentMarkupCliConfig>)()
      : exported;

  const { outDir, ...config } = resolved ?? ({} as AgentMarkupCliConfig);
  assertValidConfig(config, configFile);

  return { config, outDir, configFile };
}

function resolveConfigFile(
  configPath: string | undefined,
  cwd: string
): string | null {
  if (configPath) {
    const absolute = isAbsolute(configPath) ? configPath : resolve(cwd, configPath);
    return existsSync(absolute) ? absolute : null;
  }

  for (const candidate of DEFAULT_CONFIG_FILES) {
    const absolute = resolve(cwd, candidate);
    if (existsSync(absolute)) {
      return absolute;
    }
  }

  return null;
}

function assertValidConfig(
  config: AgentMarkupConfig,
  configFile: string
): asserts config is AgentMarkupConfig {
  if (!config || typeof config !== 'object') {
    throw new Error(`Config ${configFile} did not export an object.`);
  }

  if (typeof config.site !== 'string' || !isAbsoluteHttpUrl(config.site)) {
    throw new Error(
      `Config ${configFile}: "site" must be an absolute http(s) URL (got ${JSON.stringify(config.site)}).`
    );
  }

  if (typeof config.name !== 'string' || config.name.length === 0) {
    throw new Error(`Config ${configFile}: "name" must be a non-empty string.`);
  }
}

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Resolve the output directory to process.
 *
 * Order: explicit arg -> config `outDir` -> common build defaults. `public/` is never
 * auto-guessed because it is a source asset directory in Vite/Astro/Next; treating it as
 * output would mutate source files.
 */
export function resolveOutDir(options: {
  argOutDir?: string;
  configOutDir?: string;
  cwd: string;
}): string {
  const explicit = options.argOutDir ?? options.configOutDir;
  if (explicit) {
    const absolute = isAbsolute(explicit) ? explicit : resolve(options.cwd, explicit);
    if (!isDirectory(absolute)) {
      throw new Error(`Output directory not found: ${absolute}`);
    }
    return absolute;
  }

  for (const candidate of DEFAULT_OUTPUT_DIRS) {
    const absolute = resolve(options.cwd, candidate);
    if (isDirectory(absolute)) {
      return absolute;
    }
  }

  throw new Error(
    `Could not find an output directory. Looked for: ${DEFAULT_OUTPUT_DIRS.join(', ')}. Pass one explicitly, e.g. "agentmarkup generate ./dist".`
  );
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
