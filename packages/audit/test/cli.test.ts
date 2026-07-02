import { describe, it, expect } from 'vitest';
import { run } from '../src/cli.js';

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    ctx: {
      version: '9.9.9',
      now: () => '2026-07-02T00:00:00.000Z',
      stdout: (t: string) => out.push(t),
      stderr: (t: string) => err.push(t),
    },
  };
}

describe('cli argument handling', () => {
  it('prints help and exits 0', async () => {
    const c = capture();
    const code = await run(['--help'], c.ctx);
    expect(code).toBe(0);
    expect(c.out.join('')).toContain('Usage:');
  });

  it('prints version and exits 0', async () => {
    const c = capture();
    const code = await run(['--version'], c.ctx);
    expect(code).toBe(0);
    expect(c.out.join('')).toContain('9.9.9');
  });

  it('errors (exit 2) when no url is given', async () => {
    const c = capture();
    const code = await run([], c.ctx);
    expect(code).toBe(2);
    expect(c.err.join('')).toContain('missing <url>');
  });

  it('rejects a non-numeric --timeout (exit 2)', async () => {
    const c = capture();
    const code = await run(['--timeout', 'soon', 'https://example.com'], c.ctx);
    expect(code).toBe(2);
    expect(c.err.join('')).toContain('--timeout');
  });
});
