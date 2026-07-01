import { describe, it, expect } from 'vitest';
import {
  generateCrawlerRules,
  patchRobotsTxt,
  findBlockedCrawlers,
} from '../src/generators/robots-txt.js';

describe('generateCrawlerRules', () => {
  it('generates allow rules', () => {
    const result = generateCrawlerRules({ GPTBot: 'allow', ClaudeBot: 'allow' });
    expect(result).toContain('User-agent: GPTBot');
    expect(result).toContain('Allow: /');
    expect(result).toContain('User-agent: ClaudeBot');
  });

  it('generates disallow rules', () => {
    const result = generateCrawlerRules({ CCBot: 'disallow' });
    expect(result).toContain('User-agent: CCBot');
    expect(result).toContain('Disallow: /');
  });

  it('wraps in marker comments', () => {
    const result = generateCrawlerRules({ GPTBot: 'allow' });
    expect(result).toContain('# BEGIN agentmarkup AI crawlers');
    expect(result).toContain('# END agentmarkup AI crawlers');
  });

  it('rejects crawler names containing newlines to prevent robots.txt injection', () => {
    expect(() =>
      generateCrawlerRules({
        GPTBot: 'allow',
        'Evil\nUser-agent: *\nDisallow: /': 'disallow',
      })
    ).toThrow(/must not contain control characters or newlines/);
  });

  it('rejects crawler names containing other control characters', () => {
    expect(() =>
      generateCrawlerRules({ [['Bad', String.fromCharCode(1), 'Bot'].join('')]: 'allow' })
    ).toThrow(/Invalid AI crawler name/);
  });

  it('propagates the control-character guard through patchRobotsTxt', () => {
    expect(() =>
      patchRobotsTxt(null, { 'Evil\nDisallow: /': 'disallow' })
    ).toThrow(/must not contain control characters or newlines/);
  });
});

describe('patchRobotsTxt', () => {
  it('creates new robots.txt when none exists', () => {
    const result = patchRobotsTxt(null, { GPTBot: 'allow' });
    expect(result).toContain('User-agent: *');
    expect(result).toContain('Allow: /');
    expect(result).toContain('User-agent: GPTBot');
  });

  it('appends to existing robots.txt', () => {
    const existing = 'User-agent: *\nAllow: /\n';
    const result = patchRobotsTxt(existing, { GPTBot: 'allow' });
    expect(result).toContain('User-agent: *');
    expect(result).toContain('# BEGIN agentmarkup AI crawlers');
  });

  it('replaces existing agentmarkup block', () => {
    const existing = [
      'User-agent: *',
      'Allow: /',
      '',
      '# BEGIN agentmarkup AI crawlers',
      'User-agent: GPTBot',
      'Allow: /',
      '# END agentmarkup AI crawlers',
    ].join('\n');

    const result = patchRobotsTxt(existing, { ClaudeBot: 'allow' });
    expect(result).toContain('ClaudeBot');
    expect(result).not.toContain('GPTBot');
  });

  it('leaves existing explicit crawler rules unchanged when they already match', () => {
    const existing = [
      'User-agent: *',
      'Allow: /',
      '',
      'User-agent: GPTBot',
      'Allow: /',
      '',
      'User-agent: ClaudeBot',
      'Allow: /',
      '',
    ].join('\n');

    const result = patchRobotsTxt(existing, {
      GPTBot: 'allow',
      ClaudeBot: 'allow',
    });

    expect(result).toBe(existing);
    expect(result).not.toContain('# BEGIN agentmarkup AI crawlers');
  });
});

describe('patchRobotsTxt with Content-Signal', () => {
  it('emits a Content-Signal group in robots.txt when enabled', () => {
    const result = patchRobotsTxt(null, { GPTBot: 'allow' }, { enabled: true });
    expect(result).toContain('# BEGIN agentmarkup Content-Signal');
    expect(result).toContain('User-agent: *');
    expect(result).toContain(
      'Content-Signal: ai-train=yes, search=yes, ai-input=yes'
    );
    expect(result.indexOf('Content-Signal')).toBeLessThan(
      result.indexOf('# BEGIN agentmarkup AI crawlers')
    );
  });

  it('respects explicit directives', () => {
    const result = patchRobotsTxt(
      null,
      { GPTBot: 'allow' },
      { enabled: true, aiTrain: 'no', search: 'yes', aiInput: 'no' }
    );
    expect(result).toContain(
      'Content-Signal: ai-train=no, search=yes, ai-input=no'
    );
  });

  it('omits the Content-Signal block when disabled or unset', () => {
    expect(
      patchRobotsTxt(null, { GPTBot: 'allow' }, { enabled: false })
    ).not.toContain('Content-Signal');
    expect(patchRobotsTxt(null, { GPTBot: 'allow' })).not.toContain(
      'Content-Signal'
    );
  });

  it('is idempotent across repeated patches', () => {
    const cs = { enabled: true };
    const crawlers = { GPTBot: 'allow', CCBot: 'disallow' } as const;
    const once = patchRobotsTxt(null, crawlers, cs);
    const twice = patchRobotsTxt(once, crawlers, cs);
    expect(twice).toBe(once);
  });

  it('preserves user-authored directives when adding Content-Signal', () => {
    const existing = 'User-agent: *\nDisallow: /private/\n';
    const result = patchRobotsTxt(existing, { GPTBot: 'allow' }, { enabled: true });
    expect(result).toContain('Disallow: /private/');
    expect(result).toContain('Content-Signal:');
  });

  it('does not flag configured crawlers as blocked by the Content-Signal group', () => {
    const result = patchRobotsTxt(null, { GPTBot: 'allow' }, { enabled: true });
    expect(findBlockedCrawlers(result, { GPTBot: 'allow' })).toHaveLength(0);
  });
});

describe('findBlockedCrawlers', () => {
  it('detects wildcard disallow blocking allowed crawlers', () => {
    const robotsTxt = 'User-agent: *\nDisallow: /\n';
    const blocked = findBlockedCrawlers(robotsTxt, { GPTBot: 'allow' });
    expect(blocked).toContain('GPTBot');
  });

  it('ignores the existing agentmarkup-managed block', () => {
    const robotsTxt = [
      'User-agent: *',
      'Allow: /',
      '',
      '# BEGIN agentmarkup AI crawlers',
      'User-agent: GPTBot',
      'Disallow: /',
      '',
      '# END agentmarkup AI crawlers',
    ].join('\n');

    const blocked = findBlockedCrawlers(robotsTxt, { GPTBot: 'allow' });
    expect(blocked).toHaveLength(0);
  });

  it('returns empty when no conflicts', () => {
    const robotsTxt = 'User-agent: *\nAllow: /\n';
    const blocked = findBlockedCrawlers(robotsTxt, { GPTBot: 'allow' });
    expect(blocked).toHaveLength(0);
  });
});
