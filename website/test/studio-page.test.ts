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

function blurInput(input: HTMLInputElement): void {
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
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

describe('Agent Surface Studio page', () => {
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

  it('keeps committed human and agent edits visible, undoable, and unload-protected', async () => {
    await renderStudio();

    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('h1')?.textContent).toBe('Agent Surface Studio');
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

    expect(html).toContain('<h1>Agent Surface Studio</h1>');
    expect(html).toContain('Agent connection: checking...');

    container.innerHTML = html;
    root = hydrateRoot(container, createElement(Studio));
    await flushReact();

    const hydrationErrors = consoleError.mock.calls.filter((call) =>
      call.map(String).join(' ').toLowerCase().includes('hydrat')
    );
    expect(hydrationErrors).toEqual([]);
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

    await act(async () => {
      setInputValue(nameInput, 'Existing draft');
      blurInput(nameInput);
      setInputValue(inspectInput, 'example.com');
      blurInput(inspectInput);
    });

    await clickButton(container, 'Inspect site');
    await flushReact();
    expect(siteInput.value).toBe('');
    expect(confirm).toHaveBeenCalledTimes(1);

    await clickButton(container, 'Inspect site');
    await flushReact();
    expect(siteInput.value).toBe('https://example.com');
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
