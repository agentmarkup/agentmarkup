// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Studio from '../src/pages/Studio';
import type { RemoteResource, SiteCheckResponse } from '../src/checker/types';
import type {
  ModelContextLike,
  ModelContextToolDescriptor,
} from '../src/studio/webmcp';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

class MockModelContext implements ModelContextLike {
  readonly descriptors = new Map<string, ModelContextToolDescriptor>();

  async registerTool(
    descriptor: ModelContextToolDescriptor,
    options: { signal?: AbortSignal } = {}
  ): Promise<void> {
    if (options.signal?.aborted) {
      throw new DOMException('Registration aborted', 'AbortError');
    }

    this.descriptors.set(descriptor.name, descriptor);
    options.signal?.addEventListener('abort', () => {
      this.descriptors.delete(descriptor.name);
    }, { once: true });
  }
}

async function flushReact(microtasks = 24): Promise<void> {
  await act(async () => {
    for (let index = 0; index < microtasks; index += 1) {
      await Promise.resolve();
    }
  });
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function blurInput(input: HTMLInputElement | HTMLTextAreaElement): void {
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

async function commitInputValue(
  input: HTMLInputElement,
  value: string
): Promise<void> {
  await act(async () => setInputValue(input, value));
  await act(async () => blurInput(input));
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${label}`);
  }
  return button;
}

async function clickButton(container: HTMLElement, label: string): Promise<void> {
  await act(async () => {
    findButton(container, label).click();
  });
}

function getDisclosure(
  container: HTMLElement,
  key: 'identity' | 'access' | 'content' | 'agent-card'
): HTMLDetailsElement {
  const details = container.querySelector<HTMLDetailsElement>(
    `[data-studio-disclosure="${key}"]`
  );
  if (!details) {
    throw new Error(`Missing ${key} disclosure`);
  }
  return details;
}

async function toggleDisclosure(details: HTMLDetailsElement): Promise<void> {
  const summary = details.querySelector('summary');
  if (!summary) {
    throw new Error('Missing disclosure summary');
  }
  await act(async () => summary.click());
}

function makeResource(
  url: string,
  overrides: Partial<RemoteResource> = {}
): RemoteResource {
  return {
    requestedUrl: url,
    finalUrl: url,
    status: 404,
    ok: false,
    contentType: 'text/plain',
    body: '',
    ...overrides,
  };
}

function makeCheckResponse(): SiteCheckResponse {
  const origin = 'https://example.com';
  return {
    targetUrl: origin,
    origin,
    fetchedAt: '2026-08-26T12:00:00.000Z',
    normalizedFrom: null,
    homepage: makeResource(origin, {
      status: 200,
      ok: true,
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>Example</title></head><body><main>Example site content</main></body></html>',
    }),
    homepageMarkdown: null,
    llmsTxt: makeResource(`${origin}/llms.txt`),
    robotsTxt: makeResource(`${origin}/robots.txt`),
    sitemap: null,
    sitemapUrl: null,
    sitemapSource: null,
    samplePage: null,
    samplePageMarkdown: null,
  };
}

describe('AgentMarkup Studio page', () => {
  let container: HTMLDivElement;
  let root: Root | null;
  let modelContext: MockModelContext;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = null;
    modelContext = new MockModelContext();
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      writable: true,
      value: modelContext,
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network disabled')));
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
    }
    container.remove();
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderStudio(): Promise<void> {
    root = createRoot(container);
    await act(async () => root?.render(createElement(Studio)));
    await flushReact();
  }

  it('shows neutral empty and validation states until the draft changes', async () => {
    await renderStudio();

    const artifactPanel = container.querySelector<HTMLElement>(
      '#studio-artifact-panel'
    );
    const siteInput = container.querySelector<HTMLInputElement>('#studio-site');
    if (!artifactPanel || !siteInput) {
      throw new Error('Missing initial Studio output');
    }

    expect(artifactPanel.querySelector('.studio-artifact-empty')?.textContent).toBe(
      'Artifacts appear here as the contract fills in. Set your site URL and name to generate the first files.'
    );
    expect(artifactPanel.querySelector('.code-block')).toBeNull();
    expect(container.querySelector('.studio-review-compact')?.textContent).toContain(
      'Set your site URL to begin. Findings appear as the draft changes.'
    );
    expect(container.textContent).not.toContain('Invalid config.site');
    expect(container.querySelector('.studio-finding-counts')).toBeNull();

    await commitInputValue(siteInput, 'ftp://example.com');

    const validationSection = container.querySelector<HTMLElement>(
      '[aria-labelledby="studio-validation-title"]'
    );
    const findingCounts = container.querySelector<HTMLElement>(
      '.studio-finding-counts'
    );
    if (!validationSection || !findingCounts) {
      throw new Error('Missing expanded findings');
    }

    expect(validationSection.textContent).not.toContain(
      'Set your site URL to begin. Findings appear as the draft changes.'
    );
    expect(validationSection.textContent).toContain('Invalid config.site');
    expect(validationSection.querySelector('ul')).not.toBeNull();
    expect(findingCounts.textContent).toContain('1 error');
    expect(findingCounts.textContent).not.toContain('1 errors');
    expect(findingCounts.textContent).toContain('0 warnings');

    await commitInputValue(siteInput, 'example.com');
    expect(validationSection.textContent).toContain('No validation findings.');

    const contentDisclosure = getDisclosure(container, 'content');
    await toggleDisclosure(contentDisclosure);
    const mirrorsToggle = container.querySelector<HTMLInputElement>(
      '#studio-markdown-mirrors'
    );
    if (!mirrorsToggle) {
      throw new Error('Missing markdown mirrors toggle');
    }
    await act(async () => mirrorsToggle.click());

    expect(findingCounts.textContent).toContain('0 errors');
    expect(findingCounts.textContent).toContain('1 warning');
    expect(findingCounts.textContent).not.toContain('1 warnings');
  });

  it('starts with advanced contract sections collapsed and summarized', async () => {
    await renderStudio();

    const access = getDisclosure(container, 'access');
    const content = getDisclosure(container, 'content');
    const agentCard = getDisclosure(container, 'agent-card');

    expect(access.open).toBe(false);
    expect(content.open).toBe(false);
    expect(agentCard.open).toBe(false);
    expect(access.querySelector('summary')?.textContent).toContain('not set');
    expect(content.querySelector('summary')?.textContent).toContain('no pages yet');
    expect(agentCard.querySelector('summary')?.textContent).toContain('off');
    expect(
      container.querySelectorAll('.studio-disclosure-status[aria-live]')
    ).toHaveLength(0);

    const identityDetails = getDisclosure(container, 'identity');
    expect(identityDetails.open).toBe(false);
    expect(identityDetails.contains(container.querySelector('#studio-description'))).toBe(true);
    expect(container.querySelector('#studio-site')).not.toBeNull();
    expect(container.querySelector('#studio-name')).not.toBeNull();
    expect(container.querySelector('.studio-inspect')).not.toBeNull();
    expect(container.querySelector<HTMLDetailsElement>('.studio-connect')?.open).toBe(false);
  });

  it('auto-opens Access policy for the latest agent access edit', async () => {
    await renderStudio();

    const access = getDisclosure(container, 'access');
    const accessTool = modelContext.descriptors.get('set_access_policy');
    if (!accessTool) {
      throw new Error('Missing set_access_policy tool');
    }

    await act(async () => {
      await accessTool.execute({ groups: { train: 'disallow' } });
    });

    expect(access.open).toBe(true);
    expect(access.querySelector('summary')?.textContent).toContain('training blocked');
    expect(access.querySelector('.studio-flash legend')?.textContent).toBe(
      'Access policy'
    );
    expect(container.querySelector('.studio-agent-status')?.textContent?.trim()).toBe(
      'Agent updated Access policy.'
    );
    expect(
      container.querySelectorAll('.studio-agent-status[role="status"]')
    ).toHaveLength(1);

    await act(async () => {
      await accessTool.execute({ groups: { search: 'allow' } });
    });
    expect(access.querySelector('summary')?.textContent).toContain(
      'training blocked, search allowed'
    );

    await act(async () => {
      await accessTool.execute({
        crawlers: {
          'ExampleBot-1': 'disallow',
          'ExampleBot-2': 'allow',
          'ExampleBot-3': 'disallow',
        },
      });
    });
    expect(access.querySelector('summary')?.textContent).toContain(
      '2 groups, 3 crawler rules'
    );
  });

  it('keeps sequentially agent-opened sections open together', async () => {
    await renderStudio();

    const access = getDisclosure(container, 'access');
    const content = getDisclosure(container, 'content');
    const accessTool = modelContext.descriptors.get('set_access_policy');
    const contentTool = modelContext.descriptors.get('curate_agent_pages');
    if (!accessTool || !contentTool) {
      throw new Error('Missing agent section tools');
    }

    await act(async () => {
      await accessTool.execute({ groups: { train: 'disallow' } });
    });
    expect(access.open).toBe(true);

    await act(async () => {
      await contentTool.execute({
        llmsSections: [{ title: 'Documentation', entries: [] }],
      });
    });

    expect(access.open).toBe(true);
    expect(content.open).toBe(true);
    expect(container.querySelector('.studio-agent-status')?.textContent?.trim()).toBe(
      'Agent updated Content.'
    );
  });

  it('opens identity details for agent description edits but not name-only edits', async () => {
    await renderStudio();

    const identityDetails = getDisclosure(container, 'identity');
    const scrollIntoView = vi.fn();
    identityDetails.scrollIntoView = scrollIntoView;
    const siteInput = container.querySelector<HTMLInputElement>('#studio-site');
    const identityTool = modelContext.descriptors.get('set_site_identity');
    if (!identityTool || !siteInput) {
      throw new Error('Missing identity agent controls');
    }

    await act(async () => findButton(container, 'Copy').focus());
    await act(async () => {
      await identityTool.execute({ name: 'Agent-named site' });
    });
    expect(identityDetails.open).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(container.querySelector('.studio-starter')).toBeNull();
    expect(document.activeElement).toBe(siteInput);

    await act(async () => {
      await identityTool.execute({ description: 'A useful site description.' });
    });
    expect(identityDetails.open).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    expect(container.querySelector('.studio-agent-status')?.textContent?.trim()).toBe(
      'Agent updated Identity.'
    );
  });

  it('keeps a user-closed disclosure closed after an unrelated agent edit', async () => {
    await renderStudio();

    const access = getDisclosure(container, 'access');
    const accessTool = modelContext.descriptors.get('set_access_policy');
    const identityTool = modelContext.descriptors.get('set_site_identity');
    if (!accessTool || !identityTool) {
      throw new Error('Missing agent edit tools');
    }

    await act(async () => {
      await accessTool.execute({ groups: { train: 'disallow' } });
    });
    expect(access.open).toBe(true);

    await toggleDisclosure(access);
    expect(access.open).toBe(false);

    await act(async () => {
      await identityTool.execute({ name: 'Agent edit elsewhere' });
    });
    expect(access.open).toBe(false);

    await act(async () => {
      await accessTool.execute({ groups: { search: 'allow' } });
    });
    expect(access.open).toBe(true);
  });

  it('keeps the starter through human input, then hides it after a successful copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });
    await renderStudio();

    const starter = container.querySelector('.studio-starter');
    expect(starter?.textContent).toContain(
      'Tell your agent what you want, or start below.'
    );
    expect(starter?.textContent).toContain(
      'Make my site friendly to AI search but keep my content out of training data.'
    );

    const siteInput = container.querySelector<HTMLInputElement>('#studio-site');
    const nameInput = container.querySelector<HTMLInputElement>('#studio-name');
    if (!siteInput || !nameInput) {
      throw new Error('Missing identity input');
    }
    await commitInputValue(nameInput, 'Edited site');
    expect(container.querySelector('.studio-starter')).not.toBeNull();

    const copyButton = findButton(container, 'Copy');
    expect(copyButton.getAttribute('aria-label')).toBeNull();
    await act(async () => copyButton.focus());
    await clickButton(container, 'Copy');
    await flushReact();
    expect(writeText).toHaveBeenCalledWith(
      'Make my site friendly to AI search but keep my content out of training data.'
    );
    expect(container.querySelector('.studio-starter')).toBeNull();
    expect(document.activeElement).toBe(siteInput);
    expect(container.querySelector('.studio-copy-status')?.textContent).toBe(
      'Example prompt copied to clipboard.'
    );
  });

  it('uses a compact findings state until the first draft change', async () => {
    await renderStudio();

    const compactReview = container.querySelector('.studio-review-compact');
    expect(compactReview?.textContent).toContain('FINDINGS + ACTIVITY');
    expect(compactReview?.textContent).toContain(
      'Set your site URL to begin. Findings appear as the draft changes.'
    );
    expect(container.querySelector('.studio-review-grid')).toBeNull();

    const siteInput = container.querySelector<HTMLInputElement>('#studio-site');
    if (!siteInput) {
      throw new Error('Missing site input');
    }
    await commitInputValue(siteInput, 'example.com');

    expect(container.querySelector('.studio-review-compact')).toBeNull();
    expect(container.querySelector('.studio-review-grid')).not.toBeNull();
  });

  it('keeps committed human and agent edits visible, undoable, and unload-protected', async () => {
    await renderStudio();

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('h1')?.textContent).toBe('AgentMarkup Studio');
    expect(container.textContent).toContain(
      'An agent can configure your machine-readable website surface while you watch every change.'
    );
    expect(container.textContent).toContain('document.modelContext');
    expect(container.querySelector('.studio-capability')?.textContent).toContain(
      'Agent connected: 8 tools registered'
    );
    expect(modelContext.descriptors.size).toBe(8);

    const siteInput = container.querySelector<HTMLInputElement>('#studio-site');
    const nameInput = container.querySelector<HTMLInputElement>('#studio-name');
    if (!siteInput || !nameInput) {
      throw new Error('Missing identity controls');
    }

    await act(async () => setInputValue(siteInput, 'https://example.com'));
    expect(container.querySelectorAll('.studio-activity-row')).toHaveLength(0);
    await act(async () => blurInput(siteInput));
    expect(container.querySelectorAll('.studio-activity-row')).toHaveLength(1);

    await toggleDisclosure(getDisclosure(container, 'content'));
    await clickButton(container, 'Add section');
    const sectionInput = container.querySelector<HTMLInputElement>('#studio-section-0');
    if (!sectionInput) {
      throw new Error('Missing section title control');
    }
    await act(async () => {
      setInputValue(sectionInput, 'Gui');
      setInputValue(sectionInput, 'Guides');
    });
    expect(container.querySelectorAll('.studio-activity-row')).toHaveLength(2);
    await act(async () => blurInput(sectionInput));
    expect(container.querySelectorAll('.studio-activity-row')).toHaveLength(3);

    await act(async () => {
      setInputValue(nameInput, 'Studio');
      setInputValue(nameInput, 'Studio Example');
    });
    expect(container.querySelectorAll('.studio-activity-row')).toHaveLength(3);
    await act(async () => blurInput(nameInput));
    expect(container.querySelectorAll('.studio-activity-row')).toHaveLength(4);
    expect(
      container.querySelector('#studio-artifact-tab-llms .studio-updated-dot')
    ).not.toBeNull();
    await clickButton(container, 'llms.txt');
    expect(
      container.querySelector('#studio-artifact-tab-llms .studio-updated-dot')
    ).toBeNull();

    expect(
      container.querySelector('.studio-artifact-output .code-content')?.textContent
    ).toContain('# Studio Example');
    await clickButton(container, 'agentmarkup.config.mjs');
    expect(
      container.querySelector('.studio-artifact-output .code-content')?.textContent
    ).toContain('"Studio Example"');
    expect(container.querySelector('.studio-activity')?.textContent).toContain('Human');

    await act(async () => setInputValue(nameInput, 'Uncommitted human text'));
    const identityTool = modelContext.descriptors.get('set_site_identity');
    if (!identityTool) {
      throw new Error('Missing set_site_identity tool');
    }
    await act(async () => {
      await identityTool.execute({ name: 'Agent-renamed site' });
    });
    expect(nameInput.value).toBe('Agent-renamed site');
    expect(container.querySelector('.studio-flash legend')?.textContent).toBe('Identity');

    const accessTool = modelContext.descriptors.get('set_access_policy');
    if (!accessTool) {
      throw new Error('Missing set_access_policy tool');
    }
    await act(async () => {
      await accessTool.execute({ groups: { train: 'disallow' } });
    });

    expect(container.querySelector('.studio-flash legend')?.textContent).toBe('Access policy');
    await clickButton(container, 'robots.txt');
    const robotsOutput = container.querySelector(
      '.studio-artifact-output .code-content'
    )?.textContent ?? '';
    expect(robotsOutput).toContain('User-agent: GPTBot\nDisallow: /');
    expect(container.querySelector('.studio-activity')?.textContent).toContain('Agent');
    expect(container.querySelector('[aria-labelledby="studio-findings-title"]')?.textContent).toContain(
      'Training policies disagree'
    );

    const logSizeBeforeUndo = container.querySelectorAll('.studio-activity-row').length;
    await clickButton(container, 'Undo');
    expect(
      container.querySelector('.studio-artifact-output .code-content')?.textContent
    ).not.toContain('User-agent: GPTBot\nDisallow: /');
    expect(container.querySelectorAll('.studio-activity-row').length).toBeGreaterThan(
      logSizeBeforeUndo
    );
    expect(container.querySelector('.studio-flash')).toBeNull();

    const dirtyBeforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirtyBeforeUnload);
    expect(dirtyBeforeUnload.defaultPrevented).toBe(true);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await clickButton(container, 'Reset');
    expect(siteInput.value).toBe('');
    const pristineBeforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(pristineBeforeUnload);
    expect(pristineBeforeUnload.defaultPrevented).toBe(false);
  });

  it('prerenders and hydrates the neutral Studio shell without a mismatch', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const html = renderToString(createElement(Studio));

    expect(html).toContain('<h1>AgentMarkup Studio</h1>');
    expect(html).toContain('Agent connection: checking...');
    expect(html).toMatch(/<details class="studio-connect"[^>]* open="">/);

    container.innerHTML = html;
    root = hydrateRoot(container, createElement(Studio));
    await flushReact();

    const hydrationErrors = consoleError.mock.calls.filter((call) =>
      call.map(String).join(' ').toLowerCase().includes('hydrat')
    );
    expect(hydrationErrors).toEqual([]);
    expect(container.querySelector<HTMLDetailsElement>('.studio-connect')?.open).toBe(
      false
    );
  });

  it('supports roving artifact tabs and keeps row focus after removing a sibling', async () => {
    await renderStudio();

    const llmsTab = container.querySelector<HTMLButtonElement>('#studio-artifact-tab-llms');
    const robotsTab = container.querySelector<HTMLButtonElement>('#studio-artifact-tab-robots');
    const tabPanel = container.querySelector<HTMLElement>('#studio-artifact-panel');
    if (!llmsTab || !robotsTab || !tabPanel) {
      throw new Error('Missing artifact tabs');
    }

    expect(llmsTab.getAttribute('aria-controls')).toBe('studio-artifact-panel');
    expect(tabPanel.getAttribute('aria-labelledby')).toBe(llmsTab.id);
    await act(async () => {
      llmsTab.focus();
      llmsTab.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        bubbles: true,
      }));
    });
    expect(document.activeElement).toBe(robotsTab);
    expect(robotsTab.getAttribute('aria-selected')).toBe('true');
    expect(tabPanel.getAttribute('aria-labelledby')).toBe(robotsTab.id);

    await toggleDisclosure(getDisclosure(container, 'content'));
    await clickButton(container, 'Add section');
    await clickButton(container, 'Add section');
    const sectionInputs = container.querySelectorAll<HTMLInputElement>(
      '[id^="studio-section-"]'
    );
    const secondSectionInput = sectionInputs[1];
    const firstRemove = container.querySelector<HTMLButtonElement>(
      '.studio-repeat-card .studio-inline-field button'
    );
    if (!secondSectionInput || !firstRemove) {
      throw new Error('Missing repeated section controls');
    }

    await act(async () => secondSectionInput.focus());
    await act(async () => firstRemove.click());
    expect(document.activeElement).toBe(secondSectionInput);
    expect(secondSectionInput.id).toBe('studio-section-0');
  });

  it('keeps textarea newlines local on Enter and commits them on blur', async () => {
    await renderStudio();

    const identityDetails = container.querySelector<HTMLDetailsElement>(
      '.studio-fieldset details.studio-disclosure'
    );
    if (!identityDetails) {
      throw new Error('Missing identity details disclosure');
    }
    await toggleDisclosure(identityDetails);
    const description = container.querySelector<HTMLTextAreaElement>(
      '#studio-description'
    );
    if (!description) {
      throw new Error('Missing description textarea');
    }

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      setTextareaValue(description, 'First line\nSecond line');
      description.dispatchEvent(enterEvent);
    });
    expect(enterEvent.defaultPrevented).toBe(false);
    expect(description.value).toBe('First line\nSecond line');
    expect(container.querySelectorAll('.studio-activity-row')).toHaveLength(0);

    await act(async () => blurInput(description));
    expect(container.querySelectorAll('.studio-activity-row')).toHaveLength(1);
    await clickButton(container, 'agentmarkup.config.mjs');
    expect(
      container.querySelector('.studio-artifact-output .code-content')?.textContent
    ).toContain('First line\\nSecond line');
  });

  it('honors both inspection import confirmation branches', async () => {
    const payload = makeCheckResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    }));
    const confirm = vi.spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    await renderStudio();

    const nameInput = container.querySelector<HTMLInputElement>('#studio-name');
    const inspectInput = container.querySelector<HTMLInputElement>('#studio-inspect-url');
    const siteInput = container.querySelector<HTMLInputElement>('#studio-site');
    if (!nameInput || !inspectInput || !siteInput) {
      throw new Error('Missing inspection controls');
    }

    await commitInputValue(nameInput, 'Existing draft');
    await commitInputValue(inspectInput, 'example.com');

    await clickButton(container, 'Inspect site');
    await flushReact();
    expect(siteInput.value).toBe('');
    expect(confirm).toHaveBeenCalledTimes(1);

    await clickButton(container, 'Inspect site');
    await flushReact();
    expect(siteInput.value).toBe('https://example.com');
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('confirms an inspection import when the draft changes while inspection is pending', async () => {
    const payload = makeCheckResponse();
    let resolvePayload: ((value: SiteCheckResponse) => void) | undefined;
    const payloadPromise = new Promise<SiteCheckResponse>((resolve) => {
      resolvePayload = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn(() => payloadPromise),
    }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderStudio();

    const nameInput = container.querySelector<HTMLInputElement>('#studio-name');
    const inspectInput = container.querySelector<HTMLInputElement>('#studio-inspect-url');
    const siteInput = container.querySelector<HTMLInputElement>('#studio-site');
    if (!nameInput || !inspectInput || !siteInput) {
      throw new Error('Missing inspection controls');
    }

    await commitInputValue(inspectInput, 'example.com');
    await clickButton(container, 'Inspect site');
    expect(findButton(container, 'Inspecting...').disabled).toBe(true);

    await commitInputValue(nameInput, 'Edited while inspecting');
    await act(async () => resolvePayload?.(payload));
    await flushReact();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(siteInput.value).toBe('');
    expect(nameInput.value).toBe('Edited while inspecting');
  });

  it('shows a failure outcome when inspection import handling throws', async () => {
    const payload = makeCheckResponse();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: vi.fn().mockResolvedValue(payload),
    }));
    vi.spyOn(window, 'confirm').mockImplementation(() => {
      throw new Error('Unexpected confirmation failure');
    });
    await renderStudio();

    const nameInput = container.querySelector<HTMLInputElement>('#studio-name');
    const inspectInput = container.querySelector<HTMLInputElement>('#studio-inspect-url');
    if (!nameInput || !inspectInput) {
      throw new Error('Missing inspection controls');
    }

    await commitInputValue(nameInput, 'Existing draft');
    await commitInputValue(inspectInput, 'example.com');
    await clickButton(container, 'Inspect site');
    await flushReact();

    expect(container.querySelector('.studio-inspect-result')?.textContent).toContain(
      'The inspection result could not be applied. Try again.'
    );
    expect(findButton(container, 'Inspect site').disabled).toBe(false);
  });
});
