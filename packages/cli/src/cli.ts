import { printReport } from '@agentmarkup/core';
import { loadConfig, resolveOutDir } from './config.js';
import {
  processStaticOutput,
  type ProcessMode,
  type ProcessStaticOutputResult,
} from './process.js';

const HELP = `agentmarkup — make any built static site machine-readable for LLMs and AI agents

Usage:
  agentmarkup generate [outDir] [options]   Inject + write llms.txt, markdown mirrors, JSON-LD, robots.txt, _headers
  agentmarkup check    [outDir] [options]   Validate the files already on disk (CI gate); never writes

Options:
  --config <path>   Path to an agentmarkup config (.mjs/.js/.cjs). Defaults to agentmarkup.config.* in the cwd.
  --dry-run         (generate only) Report planned writes without mutating any files.
  --strict          (check only) Treat warnings as failures (non-zero exit).
  -h, --help        Show this help.
  -v, --version     Show the CLI version.

Output directory resolution: explicit arg -> config "outDir" -> dist/build/out/_site.
"public/" is never auto-guessed (it is a source directory); pass it explicitly if intended.
`;

interface ParsedArgs {
  command?: string;
  outDir?: string;
  configPath?: string;
  dryRun: boolean;
  strict: boolean;
  help: boolean;
  version: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    dryRun: false,
    strict: false,
    help: false,
    version: false,
  };
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        parsed.help = true;
        break;
      case '-v':
      case '--version':
        parsed.version = true;
        break;
      case '--dry-run':
        parsed.dryRun = true;
        break;
      case '--strict':
        parsed.strict = true;
        break;
      case '--config': {
        const value = argv[++i];
        if (value === undefined || value.startsWith('-')) {
          throw new Error('--config requires a path argument');
        }
        parsed.configPath = value;
        break;
      }
      default:
        if (arg.startsWith('--config=')) {
          const value = arg.slice('--config='.length);
          if (value === '') {
            throw new Error('--config requires a path argument');
          }
          parsed.configPath = value;
        } else if (arg.startsWith('-')) {
          throw new Error(`Unknown option: ${arg}`);
        } else {
          positionals.push(arg);
        }
    }
  }

  parsed.command = positionals[0];
  parsed.outDir = positionals[1];
  return parsed;
}

/**
 * Run the CLI and return a process exit code. Kept as a pure function (no `process.exit`)
 * so it is fully testable end-to-end without spawning a subprocess.
 */
export async function run(
  argv: string[],
  options: { cwd?: string; version?: string } = {}
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();

  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    return 2;
  }

  if (args.version) {
    process.stdout.write(`${options.version ?? '0.0.0'}\n`);
    return 0;
  }

  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  if (!args.command) {
    process.stdout.write(HELP);
    return 2;
  }

  if (args.command !== 'generate' && args.command !== 'check') {
    process.stderr.write(`Unknown command: ${args.command}\n\n${HELP}`);
    return 2;
  }

  const mode: ProcessMode =
    args.command === 'check' ? 'check' : args.dryRun ? 'dry-run' : 'generate';

  let result: ProcessStaticOutputResult;
  try {
    const { config, outDir: configOutDir } = await loadConfig({
      configPath: args.configPath,
      cwd,
    });
    const outDir = resolveOutDir({
      argOutDir: args.outDir,
      configOutDir,
      cwd,
    });
    result = await processStaticOutput(config, { outDir, mode });
  } catch (error) {
    process.stderr.write(`agentmarkup: ${errorMessage(error)}\n`);
    return 1;
  }

  report(result);

  if (mode === 'check') {
    if (result.errorCount > 0) {
      return 1;
    }
    if (args.strict && result.warningCount > 0) {
      return 1;
    }
    return 0;
  }

  return 0;
}

function report(result: ProcessStaticOutputResult): void {
  if (result.mode === 'check') {
    for (const finding of result.validationResults) {
      const prefix = finding.severity === 'error' ? 'error' : 'warning';
      const where = finding.path ? ` (${finding.path})` : '';
      process.stdout.write(`  ${prefix}: ${finding.message}${where}\n`);
    }
    const status =
      result.errorCount > 0 ? 'FAILED' : result.warningCount > 0 ? 'PASSED (warnings)' : 'PASSED';
    process.stdout.write(
      `\nagentmarkup check ${status} — ${result.htmlFilesProcessed} page(s), ${result.errorCount} error(s), ${result.warningCount} warning(s)\n`
    );
    return;
  }

  if (result.mode === 'dry-run') {
    process.stdout.write('agentmarkup (dry-run): no files were written\n');
  }

  printReport({
    label: '@agentmarkup/cli',
    agentCardStatus: result.agentCardStatus,
    llmsTxtEntries: result.llmsTxtEntries,
    llmsTxtSections: result.llmsTxtSections,
    llmsTxtStatus: result.llmsTxtStatus,
    llmsFullTxtEntries: result.llmsFullTxtEntries,
    llmsFullTxtStatus: result.llmsFullTxtStatus,
    jsonLdPages: result.jsonLdPages,
    markdownPages: result.markdownPages,
    markdownPagesStatus: result.markdownPagesStatus,
    markdownCanonicalHeadersCount: result.markdownCanonicalHeadersCount,
    markdownCanonicalHeadersStatus: result.markdownCanonicalHeadersStatus,
    crawlersConfigured: result.crawlersConfigured,
    robotsTxtStatus: result.robotsTxtStatus,
    contentSignalHeadersStatus: result.contentSignalHeadersStatus,
    validationResults: result.validationResults,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
