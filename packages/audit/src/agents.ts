/**
 * The crawler user-agents the audit fetches as, plus the control browser.
 * `verification` records how the real bot proves identity — this is what lets
 * the crawler-access classifier avoid false positives: a 403 for a spoofed UA
 * whose real bot verifies by IP range may be intentional, not a block bug.
 */
export type Verification = 'ip-range' | 'reverse-dns' | 'ua-only';

export interface CrawlerAgent {
  /** Short id used in findings and --json output. */
  id: string;
  /** The User-Agent string sent. */
  ua: string;
  vendor: string;
  /** Whether this agent is the browser control rather than a crawler. */
  control?: boolean;
  verification?: Verification;
  intent?: 'training' | 'search' | 'user-fetch';
  docsUrl?: string;
}

export const BROWSER_CONTROL: CrawlerAgent = {
  id: 'browser',
  ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  vendor: 'Control',
  control: true,
};

export const CRAWLER_AGENTS: CrawlerAgent[] = [
  {
    id: 'gptbot',
    ua: 'Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)',
    vendor: 'OpenAI',
    verification: 'ip-range',
    intent: 'training',
    docsUrl: 'https://platform.openai.com/docs/bots',
  },
  {
    id: 'oai-searchbot',
    ua: 'Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
    vendor: 'OpenAI',
    verification: 'ip-range',
    intent: 'search',
    docsUrl: 'https://platform.openai.com/docs/bots',
  },
  {
    id: 'claudebot',
    ua: 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +https://www.anthropic.com/claude-bot)',
    vendor: 'Anthropic',
    verification: 'ip-range',
    intent: 'training',
    docsUrl: 'https://support.anthropic.com/en/articles/8896518',
  },
  {
    id: 'perplexitybot',
    ua: 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    vendor: 'Perplexity',
    verification: 'ip-range',
    intent: 'search',
    docsUrl: 'https://docs.perplexity.ai/guides/bots',
  },
  {
    id: 'google-extended',
    ua: 'Mozilla/5.0 (compatible; Google-Extended/1.0; +http://www.google.com/bot.html)',
    vendor: 'Google',
    verification: 'reverse-dns',
    intent: 'training',
    docsUrl:
      'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers',
  },
];

export const ALL_AGENTS: CrawlerAgent[] = [BROWSER_CONTROL, ...CRAWLER_AGENTS];
