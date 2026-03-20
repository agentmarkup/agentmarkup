import { describe, expect, it } from 'vitest';
import {
  generateContentSignalHeaderValue,
  generateContentSignalHeaders,
  patchHeadersFile,
} from '../src/generators/headers.js';

describe('Content-Signal headers', () => {
  it('generates a default Content-Signal header value', () => {
    expect(generateContentSignalHeaderValue()).toBe(
      'ai-train=yes, search=yes, ai-input=yes'
    );
  });

  it('creates a headers block with markers', () => {
    const headers = generateContentSignalHeaders();
    expect(headers).toContain('# BEGIN agentmarkup Content-Signal');
    expect(headers).toContain('/*');
    expect(headers).toContain('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
  });

  it('patches an existing _headers file without losing previous rules', () => {
    const existing = [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '',
      '/llms.txt',
      '  Cache-Control: public, max-age=300',
      '',
    ].join('\n');

    const patched = patchHeadersFile(existing);

    expect(patched).toContain('X-Content-Type-Options: nosniff');
    expect(patched).toContain('/llms.txt');
    expect(patched).toContain('Content-Signal: ai-train=yes, search=yes, ai-input=yes');
  });

  it('preserves an existing matching Content-Signal block', () => {
    const existing = [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '',
      '# BEGIN agentmarkup Content-Signal',
      '/*',
      '  Content-Signal: ai-train=yes, search=yes, ai-input=yes',
      '# END agentmarkup Content-Signal',
      '',
    ].join('\n');

    expect(patchHeadersFile(existing)).toBe(existing);
  });
});
