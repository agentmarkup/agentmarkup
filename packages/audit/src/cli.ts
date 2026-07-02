import { audit } from './audit.js';
import { renderJson, renderText } from './report.js';

const HELP = `agentmarkup audit — see a URL the way AI crawlers do

Usage:
  agentmarkup-audit <url> [options]

Options:
  --json            Output the full report as JSON (for CI / league tables)
  --timeout <ms>    Per-request timeout in milliseconds (default 10000)
  --version         Print version
  --help            Show this help

Exit codes:
  0  no error-level findings
  1  at least one error-level finding (CI gate)
  2  usage error
`;

export interface RunContext {
  version: string;
  now?: () => string;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

function normalizeUrl(input: string): string {
  if (/^https?:\/\//i.test(input)) return input;
  return `https://${input}`;
}

export async function run(argv: string[], ctx: RunContext): Promise<number> {
  const out = ctx.stdout ?? ((t) => process.stdout.write(t));
  const err = ctx.stderr ?? ((t) => process.stderr.write(t));

  if (argv.includes('--help') || argv.includes('-h')) {
    out(HELP);
    return 0;
  }
  if (argv.includes('--version')) {
    out(`${ctx.version}\n`);
    return 0;
  }

  const json = argv.includes('--json');
  let timeoutMs: number | undefined;
  const timeoutIdx = argv.indexOf('--timeout');
  if (timeoutIdx !== -1) {
    const raw = Number(argv[timeoutIdx + 1]);
    if (!Number.isFinite(raw) || raw <= 0) {
      err('agentmarkup-audit: --timeout expects a positive number of milliseconds\n');
      return 2;
    }
    timeoutMs = raw;
  }

  const positional = argv.filter(
    (arg, i) =>
      !arg.startsWith('-') && argv[i - 1] !== '--timeout'
  );
  const target = positional[0];
  if (!target) {
    err('agentmarkup-audit: missing <url>\n\n');
    err(HELP);
    return 2;
  }

  const url = normalizeUrl(target);
  const fetchedAt = (ctx.now ?? (() => new Date().toISOString()))();

  const report = await audit(url, { timeoutMs, fetchedAt });
  out(json ? `${renderJson(report)}\n` : renderText(report));

  return report.summary.worst === 'error' ? 1 : 0;
}
