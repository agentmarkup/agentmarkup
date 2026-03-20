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
