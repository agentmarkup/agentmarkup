import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import {
  compileDraft,
  renderAdapterSnippet,
  renderConfigMjs,
  toAgentMarkupConfig,
} from '../src/studio/compile';
import type { AdapterName, StudioDraft } from '../src/studio/types';

const execFileAsync = promisify(execFile);

function createDraft(): StudioDraft {
  return {
    identity: {
      site: 'https://example.com',
      name: 'Example',
      description: 'Machine-readable example site.',
    },
    access: {
      crawlers: {},
      contentSignal: {
        aiTrain: 'yes',
        search: 'yes',
        aiInput: 'yes',
      },
    },
    content: {
      llmsSections: [],
      whenToUse: [],
      llmsFullEnabled: false,
      markdownMirrors: {
        enabled: false,
        exclude: [],
      },
    },
    agentCard: {
      enabled: false,
    },
  };
}

function createFullDraft(): StudioDraft {
  return {
    identity: {
      site: 'https://studio.example.com',
      name: 'Agent Surface Studio',
      description: 'Builds a coherent machine-readable website surface.',
      organization: {
        name: 'Example Labs',
        url: 'https://studio.example.com/about',
        logo: 'https://studio.example.com/logo.png',
        description: 'Maintains Agent Surface Studio.',
        sameAs: ['https://social.example.com/example-labs'],
        contactPoint: [
          {
            contactType: 'technical support',
            email: 'support@example.com',
          },
        ],
        address: {
          addressLocality: 'Bucharest',
          addressCountry: 'RO',
        },
      },
    },
    access: {
      crawlers: {
        GPTBot: 'disallow',
        'OAI-SearchBot': 'allow',
      },
      contentSignal: {
        aiTrain: 'no',
        search: 'yes',
        aiInput: 'yes',
      },
    },
    content: {
      llmsSections: [
        {
          title: 'Guides',
          entries: [
            {
              title: 'Studio guide',
              url: '/guide',
              description: 'How to configure an agent surface.',
            },
          ],
        },
      ],
      whenToUse: ['Use this site when configuring machine-readable metadata.'],
      llmsFullEnabled: true,
      markdownMirrors: {
        enabled: true,
        exclude: ['/private'],
      },
    },
    agentCard: {
      enabled: true,
      version: '1.0.0',
      description: 'Configures AgentMarkup surfaces.',
      supportedInterfaces: [
        {
          url: 'https://studio.example.com/a2a',
          protocolBinding: 'HTTP+JSON',
          protocolVersion: '1.0',
        },
      ],
      skills: [
        {
          id: 'compile-surface',
          name: 'Compile surface',
          description: 'Compiles website metadata artifacts.',
          tags: ['metadata'],
        },
      ],
      providerOrganization: 'Example Labs',
      providerUrl: 'https://studio.example.com',
    },
  };
}

describe('compileDraft', () => {
  it('compiles a full draft through the core generators', () => {
    const compiled = compileDraft(createFullDraft());

    expect(compiled.llmsTxt).toContain('# Agent Surface Studio');
    expect(compiled.llmsTxt).toContain(
      '[Studio guide](https://studio.example.com/guide.md)'
    );
    expect(compiled.llmsFullTxt).toContain('# Agent Surface Studio');
    expect(compiled.robotsTxt).toContain(
      'User-agent: GPTBot\nDisallow: /'
    );
    expect(compiled.robotsTxt).toContain(
      'Content-Signal: ai-train=no, search=yes, ai-input=yes'
    );
    expect(compiled.headersFile).toContain(
      '  Content-Signal: ai-train=no, search=yes, ai-input=yes'
    );
    expect(compiled.jsonLd[0]).toContain('"@type": "WebSite"');
    expect(compiled.jsonLd[1]).toContain('"@type": "Organization"');
    expect(compiled.jsonLd[0]).not.toContain('<script');
    expect(compiled.agentCardJson).toContain('"protocolBinding": "HTTP+JSON"');
  });

  it('returns byte-identical surface data for the same draft', () => {
    const draft = createFullDraft();

    expect(compileDraft(draft)).toEqual(compileDraft(draft));
  });

  it('omits disabled and empty features', () => {
    const draft = createDraft();
    const config = toAgentMarkupConfig(draft);
    const compiled = compileDraft(draft);

    expect(config).not.toHaveProperty('llmsFullTxt');
    expect(config).not.toHaveProperty('agentCard');
    expect(config).not.toHaveProperty('aiCrawlers');
    expect(compiled.llmsFullTxt).toBeNull();
    expect(compiled.agentCardJson).toBeNull();
    expect(compiled.configMjs).not.toMatch(/\bllmsFullTxt\s*:/);
    expect(compiled.configMjs).not.toMatch(/\bagentCard\s*:/);
    expect(compiled.configMjs).not.toMatch(/\baiCrawlers\s*:/);
  });

  it('emits an Agent Card only when its enabled config is valid', () => {
    const enabled = createFullDraft();
    const valid = compileDraft(enabled);

    expect(valid.agentCardJson).not.toBeNull();
    expect(
      valid.validations.some((result) =>
        result.message.startsWith('Agent Card')
      )
    ).toBe(false);
  });

  it('omits an enabled-but-invalid Agent Card from artifacts and install config', () => {
    const draft = createFullDraft();
    draft.agentCard = {
      enabled: true,
      version: '',
      description: '',
      supportedInterfaces: [],
    };

    expect(() => compileDraft(draft)).not.toThrow();
    const invalid = compileDraft(draft);
    expect(invalid.agentCardJson).toBeNull();
    expect(invalid.configMjs).not.toContain('agentCard');
    expect(
      invalid.validations.some(
        (result) =>
          result.severity === 'error' &&
          result.message.includes('supportedInterfaces')
      )
    ).toBe(true);
  });

  it.each(['', 'example.com', 'ftp://example.com'])(
    'reports an invalid site without throwing for %j',
    (site) => {
      const draft = createDraft();
      draft.identity.site = site;

      expect(() => compileDraft(draft)).not.toThrow();
      expect(
        compileDraft(draft).validations.some(
          (result) =>
            result.severity === 'error' &&
            result.message.includes('Invalid config.site')
        )
      ).toBe(true);
    }
  );
});

describe('renderConfigMjs', () => {
  it('keeps hostile values inert and round-trips them unchanged', async () => {
    const hostile = [
      '"quoted"',
      '\\backslash',
      'line one\nline two',
      '\u2028\u2029',
      '`backtick`',
      '${globalThis.__studioPwned = true}',
      '"; globalThis.__studioPwned = true; //',
    ].join('|');
    const hostileUrl = `https://example.com/${encodeURIComponent(hostile)}`;
    const draft: StudioDraft = {
      identity: {
        site: hostile,
        name: hostile,
        description: hostile,
        organization: {
          name: hostile,
          url: hostile,
          logo: hostile,
          description: hostile,
          sameAs: [hostile],
          contactPoint: [
            {
              contactType: hostile,
              email: hostile,
              telephone: hostile,
              url: hostile,
              areaServed: hostile,
              availableLanguage: hostile,
            },
          ],
          address: {
            streetAddress: hostile,
            addressLocality: hostile,
            addressRegion: hostile,
            postalCode: hostile,
            addressCountry: hostile,
          },
        },
      },
      access: {
        crawlers: {
          [hostile]: 'disallow',
        },
        contentSignal: {
          aiTrain: 'no',
          search: 'yes',
          aiInput: 'no',
        },
      },
      content: {
        llmsSections: [
          {
            title: hostile,
            entries: [
              {
                title: hostile,
                url: hostile,
                description: hostile,
              },
            ],
          },
        ],
        whenToUse: [hostile],
        llmsFullEnabled: true,
        markdownMirrors: {
          enabled: true,
          exclude: [hostile],
        },
      },
      agentCard: {
        enabled: true,
        version: hostile,
        description: hostile,
        supportedInterfaces: [
          {
            url: hostileUrl,
            protocolBinding: hostile,
            protocolVersion: hostile,
            tenant: hostile,
          },
        ],
        skills: [
          {
            id: hostile,
            name: hostile,
            description: hostile,
            tags: [hostile],
            examples: [hostile],
            inputModes: [hostile],
            outputModes: [hostile],
            security: [{ [hostile]: [hostile] }],
          },
        ],
        providerOrganization: hostile,
        providerUrl: hostileUrl,
      },
    };
    const studioGlobal = globalThis as typeof globalThis & {
      __studioPwned?: boolean;
    };
    delete studioGlobal.__studioPwned;

    const root = await mkdtemp(join(tmpdir(), 'agentmarkup-studio-'));
    const configPath = join(root, 'agentmarkup.config.mjs');

    try {
      await writeFile(configPath, renderConfigMjs(draft), 'utf8');
      const configUrl = pathToFileURL(configPath).href;
      const loader = [
        'const loaded = await import(process.argv[1]);',
        'process.stdout.write(JSON.stringify({',
        '  value: loaded.default,',
        '  pwned: globalThis.__studioPwned ?? null,',
        '}));',
      ].join('\n');
      const { stdout } = await execFileAsync(process.execPath, [
        '--input-type=module',
        '--eval',
        loader,
        configUrl,
      ]);
      const imported = JSON.parse(stdout) as {
        value: unknown;
        pwned: boolean | null;
      };

      expect(imported.value).toEqual(toAgentMarkupConfig(draft));
      expect(imported.pwned).toBeNull();
      expect(studioGlobal.__studioPwned).toBeUndefined();
    } finally {
      delete studioGlobal.__studioPwned;
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps the template keys in their documented order', () => {
    const rendered = renderConfigMjs(createFullDraft());

    expect(rendered).toMatch(
      /\bsite\s*:[\s\S]*\bname\s*:[\s\S]*\bdescription\s*:[\s\S]*\bllmsTxt\s*:[\s\S]*\bmarkdownPages\s*:[\s\S]*\bcontentSignalHeaders\s*:[\s\S]*\bglobalSchemas\s*:[\s\S]*\baiCrawlers\s*:[\s\S]*\bvalidation\s*:/
    );
    expect(rendered).not.toMatch(/\boutDir\s*:/);
  });
});

describe('renderAdapterSnippet', () => {
  it('returns a non-empty distinct wrapper for every supported adapter', () => {
    const draft = createFullDraft();
    const adapters: AdapterName[] = ['vite', 'astro', 'next', 'nuxt', 'cli'];
    const snippets = adapters.map((adapter) =>
      renderAdapterSnippet(adapter, draft)
    );

    expect(new Set(snippets).size).toBe(adapters.length);
    for (const snippet of snippets) {
      expect(snippet.trim()).not.toBe('');
      expect(snippet).toContain('agentmarkup.config.mjs');
    }
  });
});
