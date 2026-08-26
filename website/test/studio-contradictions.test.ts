import { describe, expect, it } from 'vitest';

import { detectContradictions } from '../src/studio/contradictions';
import {
  CRAWLER_GROUPS,
  type Contradiction,
  type ContradictionCode,
  type StudioDraft,
} from '../src/studio/types';

const expectedSeverities = {
  C1: 'error',
  C2: 'error',
  C3: 'error',
  C4: 'warning',
  C5: 'error',
  C6: 'warning',
  C7: 'warning',
  C8: 'warning',
} as const satisfies Record<ContradictionCode, Contradiction['severity']>;

function createDraft(): StudioDraft {
  return {
    identity: {
      site: 'https://example.com',
      name: 'Example',
      description: 'An example site.',
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

function createDraftWithEntry(
  url = '/guide',
  title = 'Guide'
): StudioDraft {
  const draft = createDraft();
  draft.content.llmsSections = [
    {
      title: 'Resources',
      entries: [{ title, url }],
    },
  ];
  return draft;
}

function expectFinding(
  draft: StudioDraft,
  code: ContradictionCode
): Contradiction {
  const finding = detectContradictions(draft).find(
    (candidate) => candidate.code === code
  );
  expect(finding).toMatchObject({
    code,
    severity: expectedSeverities[code],
  });
  return finding as Contradiction;
}

function expectNoFinding(draft: StudioDraft, code: ContradictionCode): void {
  expect(
    detectContradictions(draft).some((candidate) => candidate.code === code)
  ).toBe(false);
}

describe('C1 retrieval-blocked-but-cited', () => {
  it('reports an error when every search crawler is explicitly disallowed', () => {
    const draft = createDraftWithEntry();
    for (const crawler of CRAWLER_GROUPS.search) {
      draft.access.crawlers[crawler] = 'disallow';
    }

    const finding = expectFinding(draft, 'C1');
    expect(finding.loci).toEqual(['llms.txt', 'robots.txt']);
  });

  it('does not report when only three search crawlers are disallowed', () => {
    const draft = createDraftWithEntry();
    for (const crawler of CRAWLER_GROUPS.search.slice(0, 3)) {
      draft.access.crawlers[crawler] = 'disallow';
    }

    expectNoFinding(draft, 'C1');
  });

  it('does not treat blocked user-triggered agent fetchers as blocked search retrieval', () => {
    const draft = createDraftWithEntry();
    for (const crawler of CRAWLER_GROUPS.agent) {
      draft.access.crawlers[crawler] = 'disallow';
    }
    for (const crawler of CRAWLER_GROUPS.search) {
      draft.access.crawlers[crawler] = 'allow';
    }

    expectNoFinding(draft, 'C1');
  });
});

describe('C2 content-signal-vs-llms', () => {
  it('reports an error for either concrete Content-Signal conflict', () => {
    const llmsConflict = createDraftWithEntry();
    llmsConflict.access.contentSignal.search = 'no';
    const llmsFinding = expectFinding(llmsConflict, 'C2');
    expect(llmsFinding.title).toBe('Content policy conflicts with llms.txt');
    expect(llmsFinding.loci).toEqual(['Content-Signal', 'llms.txt']);

    const mirrorConflict = createDraft();
    mirrorConflict.content.markdownMirrors.enabled = true;
    mirrorConflict.access.contentSignal.aiInput = 'no';
    const finding = expectFinding(mirrorConflict, 'C2');
    expect(finding.title).toBe('Content policy conflicts with mirrors');
    expect(finding.loci).toEqual(['Content-Signal', 'markdown mirrors']);
  });

  it('merges simultaneous llms.txt and mirror conflicts', () => {
    const draft = createDraftWithEntry();
    draft.access.contentSignal.search = 'no';
    draft.access.contentSignal.aiInput = 'no';
    draft.content.markdownMirrors.enabled = true;

    const finding = expectFinding(draft, 'C2');
    expect(finding.title).toBe(
      'Content policy conflicts with llms.txt and mirrors'
    );
    expect(finding.detail).toContain('Content-Signal search is "no"');
    expect(finding.detail).toContain('Content-Signal ai-input is "no"');
    expect(finding.loci).toEqual([
      'Content-Signal',
      'llms.txt',
      'markdown mirrors',
    ]);
  });

  it('does not report when both advertised surfaces are allowed', () => {
    const draft = createDraftWithEntry();
    draft.content.markdownMirrors.enabled = true;

    expectNoFinding(draft, 'C2');
  });

  it('reports when search is denied for a whenToUse-only llms.txt', () => {
    const draft = createDraft();
    draft.content.whenToUse = ['Use this site for examples.'];
    draft.access.contentSignal.search = 'no';

    const finding = expectFinding(draft, 'C2');
    expect(finding.detail).toContain('1 whenToUse entry');
  });

  it('does not report for a whenToUse-only llms.txt when search is allowed', () => {
    const draft = createDraft();
    draft.content.whenToUse = ['Use this site for examples.'];
    draft.access.contentSignal.search = 'yes';

    expectNoFinding(draft, 'C2');
  });
});

describe('C3 mirror-excluded-but-listed', () => {
  it('reports an error naming the excluded listed page and pattern', () => {
    const draft = createDraftWithEntry(
      'https://example.com/docs/private.html',
      'Private docs'
    );
    draft.identity.site = 'https://example.com/docs';
    draft.content.markdownMirrors.enabled = true;
    draft.content.markdownMirrors.exclude = ['/private/'];

    const finding = expectFinding(draft, 'C3');
    expect(finding.detail).toContain('Private docs');
    expect(finding.detail).toContain('/private/');
    expect(finding.loci).toEqual(['llms.txt', 'markdown mirrors']);
  });

  it('matches relative and absolute entries against a path-prefixed site', () => {
    for (const url of [
      '/docs/private.html',
      'https://example.com/docs/private.html',
    ]) {
      const draft = createDraftWithEntry(url, 'Private docs');
      draft.identity.site = 'https://example.com/docs';
      draft.content.markdownMirrors.enabled = true;
      draft.content.markdownMirrors.exclude = ['/private/'];

      const finding = expectFinding(draft, 'C3');
      expect(finding.detail).toContain('whose page path "/private.html"');
    }
  });

  it('keeps root-site relative entry matching unchanged', () => {
    const draft = createDraftWithEntry('/private.html', 'Private docs');
    draft.content.markdownMirrors.enabled = true;
    draft.content.markdownMirrors.exclude = ['/private/'];

    const finding = expectFinding(draft, 'C3');
    expect(finding.detail).toContain('whose page path "/private.html"');
  });

  it('does not report when the excluded page is not listed', () => {
    const draft = createDraftWithEntry('/public');
    draft.content.markdownMirrors.enabled = true;
    draft.content.markdownMirrors.exclude = ['/private'];

    expectNoFinding(draft, 'C3');
  });
});

describe('C4 identity-drift', () => {
  it('reports a warning for JSON-LD or Agent Card identity drift', () => {
    const organizationDrift = createDraft();
    organizationDrift.identity.organization = {
      name: 'Different Organization',
      url: 'https://different.example',
    };
    const organizationFinding = expectFinding(organizationDrift, 'C4');
    expect(organizationFinding.title).toBe('Published identity values drift');
    expect(organizationFinding.loci).toEqual(['JSON-LD', 'site identity']);

    const cardDrift = createDraft();
    cardDrift.agentCard = {
      enabled: true,
      version: '1.0.0',
      supportedInterfaces: [
        {
          url: 'https://example.com/a2a',
          protocolBinding: 'HTTP+JSON',
          protocolVersion: '1.0',
        },
      ],
      providerOrganization: 'Different Provider',
    };
    const cardFinding = expectFinding(cardDrift, 'C4');
    expect(cardFinding.title).toBe('Agent Card identity drifts');
    expect(cardFinding.loci).toEqual(['Agent Card', 'site identity']);
  });

  it('merges simultaneous Organization and Agent Card identity drift', () => {
    const draft = createDraft();
    draft.identity.organization = {
      name: 'Different Organization',
      url: 'https://organization.example',
    };
    draft.agentCard = {
      enabled: true,
      version: '1.0.0',
      supportedInterfaces: [
        {
          url: 'https://example.com/a2a',
          protocolBinding: 'HTTP+JSON',
          protocolVersion: '1.0',
        },
      ],
      providerOrganization: 'Different Provider',
      providerUrl: 'https://provider.example',
    };

    const finding = expectFinding(draft, 'C4');
    expect(finding.detail).toContain('Organization name');
    expect(finding.detail).toContain('Organization URL');
    expect(finding.detail).toContain('Agent Card provider organization');
    expect(finding.detail).toContain('Agent Card provider URL');
    expect(finding.loci).toEqual([
      'JSON-LD',
      'site identity',
      'Agent Card',
    ]);
  });

  it('does not report matching names and trailing-slash-normalized URLs', () => {
    const draft = createDraft();
    draft.identity.organization = {
      name: 'Example',
      url: 'https://example.com/',
    };
    draft.agentCard.providerOrganization = 'Example';

    expectNoFinding(draft, 'C4');
  });

  it('reports when the Agent Card provider URL drifts from the site identity', () => {
    const draft = createDraft();
    draft.agentCard.enabled = true;
    draft.agentCard.providerUrl = 'https://provider.example';

    const finding = expectFinding(draft, 'C4');
    expect(finding.detail).toContain('https://provider.example');
    expect(finding.loci).toEqual(['Agent Card', 'site identity']);
  });

  it('does not report Agent Card provider URL drift for a trailing slash difference', () => {
    const draft = createDraft();
    draft.agentCard.enabled = true;
    draft.agentCard.providerUrl = 'https://example.com/';

    expectNoFinding(draft, 'C4');
  });
});

describe('C5 card-without-interface', () => {
  it('reports an error when an enabled card has no version or interfaces', () => {
    const draft = createDraft();
    draft.agentCard = {
      enabled: true,
      version: ' ',
      supportedInterfaces: [],
    };

    const finding = expectFinding(draft, 'C5');
    expect(finding.detail).toContain('version must be a non-empty string');
    expect(finding.detail).toContain(
      'supportedInterfaces must include at least one interface'
    );
  });

  it('surfaces core Agent Card validation errors as C5', () => {
    const draft = createDraft();
    draft.agentCard = {
      enabled: true,
      version: '1.0.0',
      supportedInterfaces: [
        {
          url: '/relative-a2a',
          protocolBinding: 'HTTP+JSON',
          protocolVersion: '1.0',
        },
      ],
    };

    const finding = expectFinding(draft, 'C5');
    expect(finding.detail).toContain(
      'supportedInterfaces[0].url must be an absolute URL'
    );
  });

  it('does not report a complete enabled card', () => {
    const draft = createDraft();
    draft.agentCard = {
      enabled: true,
      version: '1.0.0',
      supportedInterfaces: [
        {
          url: 'https://example.com/a2a',
          protocolBinding: 'HTTP+JSON',
          protocolVersion: '1.0',
        },
      ],
    };

    expectNoFinding(draft, 'C5');
  });
});

describe('C6 train-allowed-signal-denied', () => {
  it('reports a warning in either direction of the training-policy conflict', () => {
    const signalDenied = createDraft();
    signalDenied.access.contentSignal.aiTrain = 'no';
    signalDenied.access.crawlers.GPTBot = 'allow';
    expectFinding(signalDenied, 'C6');

    const signalAllowed = createDraft();
    signalAllowed.access.contentSignal.aiTrain = 'yes';
    for (const crawler of CRAWLER_GROUPS.train) {
      signalAllowed.access.crawlers[crawler] = 'disallow';
    }
    expectFinding(signalAllowed, 'C6');
  });

  it('does not report when configured training policies agree', () => {
    const denied = createDraft();
    denied.access.contentSignal.aiTrain = 'no';
    denied.access.crawlers.GPTBot = 'disallow';
    expectNoFinding(denied, 'C6');

    const allowed = createDraft();
    allowed.access.contentSignal.aiTrain = 'yes';
    allowed.access.crawlers.GPTBot = 'allow';
    expectNoFinding(allowed, 'C6');
  });

  it('does not report ai-train yes for only the commonly blocked Bytespider', () => {
    const draft = createDraft();
    draft.access.contentSignal.aiTrain = 'yes';
    draft.access.crawlers.Bytespider = 'disallow';

    expectNoFinding(draft, 'C6');
  });
});

describe('C7 mirrors-without-pages', () => {
  it('reports a warning when mirrors have no same-site page entries', () => {
    const emptyDraft = createDraft();
    emptyDraft.content.markdownMirrors.enabled = true;
    expectFinding(emptyDraft, 'C7');

    const fileOnlyDraft = createDraftWithEntry('https://example.com/report.pdf');
    fileOnlyDraft.content.markdownMirrors.enabled = true;
    expectFinding(fileOnlyDraft, 'C7');
  });

  it('does not report when a same-site page is listed', () => {
    const draft = createDraftWithEntry('/guide');
    draft.content.markdownMirrors.enabled = true;

    expectNoFinding(draft, 'C7');
  });
});

describe('C8 whenToUse-empty-surface', () => {
  it('reports a warning when usage guidance has no llms.txt entries', () => {
    const draft = createDraft();
    draft.content.whenToUse = ['Use this site for examples.'];

    const finding = expectFinding(draft, 'C8');
    expect(finding.loci).toEqual(['llms.txt']);
  });

  it('does not report when usage guidance has a listed entry', () => {
    const draft = createDraftWithEntry();
    draft.content.whenToUse = ['Use this site for examples.'];

    expectNoFinding(draft, 'C8');
  });
});

describe('contradiction engine invariants', () => {
  it('returns no contradictions for the initial draft', () => {
    expect(detectContradictions(createDraft())).toEqual([]);
  });

  it('sorts findings by stable code order', () => {
    const draft = createDraftWithEntry('/private');
    draft.access.contentSignal.search = 'no';
    draft.access.contentSignal.aiTrain = 'no';
    draft.access.crawlers.GPTBot = 'allow';
    for (const crawler of CRAWLER_GROUPS.search) {
      draft.access.crawlers[crawler] = 'disallow';
    }
    draft.content.markdownMirrors.enabled = true;
    draft.content.markdownMirrors.exclude = ['/private'];
    draft.identity.organization = {
      name: 'Different Organization',
      url: 'https://example.com',
    };
    draft.agentCard = {
      enabled: true,
      supportedInterfaces: [],
    };

    expect(detectContradictions(draft).map(({ code }) => code)).toEqual([
      'C1',
      'C2',
      'C3',
      'C4',
      'C5',
      'C6',
    ]);
  });

  it('does not throw for missing or malformed draft slices', () => {
    const malformedDrafts: unknown[] = [
      null,
      undefined,
      {},
      {
        identity: 'invalid',
        access: { crawlers: null, contentSignal: [] },
        content: {
          llmsSections: [null, { entries: [null, { title: 4, url: 7 }] }],
          whenToUse: [null],
          markdownMirrors: { enabled: true, exclude: [null, 4] },
        },
        agentCard: { enabled: true, supportedInterfaces: 'invalid' },
      },
    ];

    for (const malformed of malformedDrafts) {
      expect(() =>
        detectContradictions(malformed as StudioDraft)
      ).not.toThrow();
    }
  });
});
