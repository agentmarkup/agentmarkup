import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type TextareaHTMLAttributes,
} from 'react';

import CodeBlock from '../CodeBlock';
import { ContextualFaq } from '../ui/ContextualFaq';
import { GlassSurface } from '../ui/GlassSurface';
import { ResponsiveTable } from '../ui/ResponsiveTable';
import { StatusIcon, StatusLabel } from '../ui/Status';
import { normalizeWebsiteInput } from '../normalizeWebsiteInput';
import {
  compileDraft,
  renderAdapterSnippet,
  renderConfigMjs,
} from '../studio/compile';
import { detectContradictions } from '../studio/contradictions';
import { inspectSite } from '../studio/import-check';
import {
  createInitialState,
  initialStudioDraft,
  studioReducer,
} from '../studio/model';
import StudioAgentTools from '../studio/StudioAgentTools';
import type { StudioAgentToolsStatus } from '../studio/StudioAgentTools';
import { CRAWLER_GROUPS, LIMITS } from '../studio/types';
import type {
  AdapterName,
  CrawlerGroupName,
  InspectSiteOutcome,
  StudioAction,
  StudioDraft,
} from '../studio/types';
import type { StudioToolDeps } from '../studio/webmcp';

type StudioDispatch = Dispatch<StudioAction>;
type LlmsSection = StudioDraft['content']['llmsSections'][number];
type LlmsEntry = LlmsSection['entries'][number];
type AgentInterface = NonNullable<
  StudioDraft['agentCard']['supportedInterfaces']
>[number];
type AgentStatus = 'unknown' | StudioAgentToolsStatus;
type GroupChoice = 'allow' | 'disallow' | 'unset';
type ArtifactKey =
  | 'llms'
  | 'robots'
  | 'headers'
  | 'jsonld'
  | 'agent-card'
  | 'llms-full'
  | 'config'
  | 'adapter';

interface ArtifactTab {
  id: ArtifactKey;
  label: string;
  code: string;
}

interface AgentFlash {
  actionType: StudioAction['type'];
  seq: number;
}

type CommitInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'defaultValue' | 'onBlur' | 'onChange' | 'onKeyDown' | 'value'
> & {
  value: string;
  onCommit: (value: string) => void;
  normalize?: (value: string) => string;
};

type CommitTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'defaultValue' | 'onBlur' | 'onChange' | 'onKeyDown' | 'value'
> & {
  value: string;
  onCommit: (value: string) => void;
};

const ADAPTERS: AdapterName[] = ['vite', 'astro', 'next', 'nuxt', 'cli'];

const STUDIO_FAQS = [
  {
    question: 'What is WebMCP?',
    answer:
      'WebMCP lets a compatible browser expose page-defined tools to an agent. In the Studio, those tools edit the same visible draft that you can edit manually.',
  },
  {
    question: 'Is anything sent to a server?',
    answer:
      'The draft stays in memory in this browser tab. The optional site inspection sends the entered public URL through the existing agentmarkup checker API and imports only bounded structured findings.',
  },
  {
    question: 'How are findings decided?',
    answer:
      'Every validation and contradiction is deterministic. The Studio reports the exact rule and affected surfaces without producing a rating or percentage.',
  },
  {
    question: 'How do I install the result?',
    answer:
      'Download agentmarkup.config.mjs, install the matching agentmarkup package, copy the Adapter setup snippet, and run your normal production build.',
  },
];

function isPristineDraft(draft: StudioDraft): boolean {
  return JSON.stringify(draft) === JSON.stringify(initialStudioDraft);
}

function getGroupChoice(
  draft: StudioDraft,
  group: CrawlerGroupName
): GroupChoice {
  const directives = CRAWLER_GROUPS[group].map(
    (crawler) => draft.access.crawlers[crawler]
  );

  if (directives.every((directive) => directive === 'allow')) {
    return 'allow';
  }
  if (directives.every((directive) => directive === 'disallow')) {
    return 'disallow';
  }
  return 'unset';
}

function useCommittedText(
  value: string,
  onCommit: (value: string) => void,
  normalize: (value: string) => string = (nextValue) => nextValue
) {
  const [localValue, setLocalValue] = useState(value);
  const lastCommittedRef = useRef(value);

  useEffect(() => {
    if (value !== lastCommittedRef.current) {
      lastCommittedRef.current = value;
      setLocalValue(value);
    }
  }, [value]);

  const commit = () => {
    const nextValue = normalize(localValue);
    setLocalValue(nextValue);
    if (nextValue === lastCommittedRef.current) {
      return;
    }

    lastCommittedRef.current = nextValue;
    onCommit(nextValue);
  };

  return { localValue, setLocalValue, commit };
}

function CommitInput({
  value,
  onCommit,
  normalize,
  ...inputProps
}: CommitInputProps) {
  const committed = useCommittedText(value, onCommit, normalize);

  return (
    <input
      {...inputProps}
      value={committed.localValue}
      onChange={(event) => committed.setLocalValue(event.target.value)}
      onBlur={committed.commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          committed.commit();
        }
      }}
    />
  );
}

function CommitTextarea({
  value,
  onCommit,
  ...textareaProps
}: CommitTextareaProps) {
  const committed = useCommittedText(value, onCommit);

  return (
    <textarea
      {...textareaProps}
      value={committed.localValue}
      onChange={(event) => committed.setLocalValue(event.target.value)}
      onBlur={committed.commit}
    />
  );
}

function useStableIds(length: number, prefix: string) {
  const counterRef = useRef(length);
  const [ids, setIds] = useState(() =>
    Array.from({ length }, (_, index) => `${prefix}-${index}`)
  );

  useEffect(() => {
    setIds((current) => {
      if (current.length === length) {
        return current;
      }

      const nextIds = current.slice(0, length);
      while (nextIds.length < length) {
        nextIds.push(`${prefix}-${counterRef.current++}`);
      }
      return nextIds;
    });
  }, [length, prefix]);

  return {
    ids,
    appendId: () =>
      setIds((current) => [...current, `${prefix}-${counterRef.current++}`]),
    removeIdAt: (index: number) =>
      setIds((current) => current.filter((_, currentIndex) => currentIndex !== index)),
  };
}

function Studio() {
  const [state, dispatch] = useReducer(
    studioReducer,
    undefined,
    createInitialState
  );
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('unknown');
  const [adapter, setAdapter] = useState<AdapterName>('vite');
  const [activeArtifact, setActiveArtifact] = useState<ArtifactKey>('llms');
  const [updatedArtifacts, setUpdatedArtifacts] = useState<Set<ArtifactKey>>(
    () => new Set()
  );
  const [inspectUrl, setInspectUrl] = useState('');
  const [inspectPending, setInspectPending] = useState(false);
  const [inspectOutcome, setInspectOutcome] =
    useState<InspectSiteOutcome | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const draft = state.draft;
  const pristine = isPristineDraft(draft);
  const compiled = useMemo(() => compileDraft(draft), [draft]);
  const configMjs = useMemo(() => renderConfigMjs(draft), [draft]);
  const contradictions = useMemo(() => detectContradictions(draft), [draft]);
  const adapterSnippet = useMemo(
    () => renderAdapterSnippet(adapter, draft),
    [adapter, draft]
  );

  const deps = useMemo<StudioToolDeps>(
    () => ({
      getState: () => stateRef.current,
      dispatch,
      compile: compileDraft,
      detect: detectContradictions,
      renderConfig: renderConfigMjs,
      inspectSite,
    }),
    [dispatch]
  );

  const artifactTabs = useMemo<ArtifactTab[]>(() => {
    const tabs: ArtifactTab[] = [
      { id: 'llms', label: 'llms.txt', code: compiled.llmsTxt },
      { id: 'robots', label: 'robots.txt', code: compiled.robotsTxt },
      { id: 'headers', label: '_headers', code: compiled.headersFile },
      {
        id: 'jsonld',
        label: 'JSON-LD',
        code: compiled.jsonLd.join('\n\n'),
      },
    ];

    if (compiled.agentCardJson !== null) {
      tabs.push({
        id: 'agent-card',
        label: 'agent-card.json',
        code: compiled.agentCardJson,
      });
    }
    if (compiled.llmsFullTxt !== null) {
      tabs.push({
        id: 'llms-full',
        label: 'llms-full.txt',
        code: compiled.llmsFullTxt,
      });
    }

    tabs.push(
      {
        id: 'config',
        label: 'agentmarkup.config.mjs',
        code: configMjs,
      },
      { id: 'adapter', label: 'Adapter setup', code: adapterSnippet }
    );

    return tabs;
  }, [adapterSnippet, compiled, configMjs]);

  const artifactContent = useMemo(
    () =>
      Object.fromEntries(
        artifactTabs.map((tab) => [tab.id, tab.code])
      ) as Partial<Record<ArtifactKey, string>>,
    [artifactTabs]
  );
  const previousArtifactContentRef = useRef<
    Partial<Record<ArtifactKey, string>> | null
  >(null);

  useEffect(() => {
    const previous = previousArtifactContentRef.current;
    if (previous) {
      setUpdatedArtifacts((current) => {
        const next = new Set(current);
        for (const tab of artifactTabs) {
          if (
            previous[tab.id] !== artifactContent[tab.id]
          ) {
            next.add(tab.id);
          }
        }
        return next;
      });
    }
    previousArtifactContentRef.current = artifactContent;
  }, [artifactContent, artifactTabs]);

  useEffect(() => {
    if (pristine) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pristine]);

  const selectedArtifact =
    artifactTabs.find((tab) => tab.id === activeArtifact) ?? artifactTabs[0];
  const latestActivity = state.log.at(-1);
  const agentFlash: AgentFlash | null = latestActivity?.source === 'agent'
    ? { actionType: latestActivity.actionType, seq: latestActivity.seq }
    : null;

  const openArtifact = (id: ArtifactKey) => {
    setActiveArtifact(id);
    setUpdatedArtifacts((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };

  const handleArtifactTabKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const currentIndex = artifactTabs.findIndex(
      (tab) => tab.id === activeArtifact
    );
    let nextIndex = currentIndex < 0 ? 0 : currentIndex;
    if (event.key === 'ArrowLeft') {
      nextIndex = (nextIndex - 1 + artifactTabs.length) % artifactTabs.length;
    } else if (event.key === 'ArrowRight') {
      nextIndex = (nextIndex + 1) % artifactTabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else {
      nextIndex = artifactTabs.length - 1;
    }

    event.preventDefault();
    const nextTab = event.currentTarget.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]'
    )[nextIndex];
    nextTab?.focus();
  };

  const downloadConfig = () => {
    const blob = new Blob([configMjs], { type: 'text/javascript;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'agentmarkup.config.mjs';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 150);
  };

  const runInspection = async () => {
    setInspectPending(true);
    setInspectOutcome(null);

    try {
      const outcome = await inspectSite(inspectUrl);
      setInspectOutcome(outcome);

      if (!outcome.ok || !outcome.draftPatch) {
        return;
      }

      const currentDraftIsPristine = isPristineDraft(stateRef.current.draft);
      const accepted = currentDraftIsPristine || window.confirm(
        'Import the inspected settings into this draft? Your current draft can be restored with Undo.'
      );
      if (!accepted) {
        return;
      }

      dispatch({
        type: 'IMPORT_FROM_CHECK',
        source: 'human',
        payload: outcome.draftPatch,
        sourceUrl: outcome.sourceUrl ?? inspectUrl,
      });
    } catch {
      setInspectOutcome({
        ok: false,
        errorCode: 'apply_failed',
        summaryText: 'The inspection result could not be applied. Try again.',
      });
    } finally {
      setInspectPending(false);
    }
  };

  const resetDraft = () => {
    if (
      window.confirm(
        'Reset the Studio draft? The activity log will keep a record of this action.'
      )
    ) {
      dispatch({ type: 'RESET', source: 'human' });
    }
  };

  const errorCount =
    compiled.validations.filter((finding) => finding.severity === 'error').length +
    contradictions.filter((finding) => finding.severity === 'error').length;
  const warningCount =
    compiled.validations.filter((finding) => finding.severity === 'warning').length +
    contradictions.filter((finding) => finding.severity === 'warning').length;

  return (
    <main>
      <article className="doc-page studio-page">
        <StudioAgentTools deps={deps} onStatus={setAgentStatus} />

        <header className="studio-hero">
          <p className="section-kicker">WebMCP workspace</p>
          <h1>Agent Surface Studio</h1>
          <p className="doc-intro studio-intro">
            An agent can configure your machine-readable website surface while
            you watch every change. The Studio compiles deterministic artifacts
            in the browser and detects contradictions across identity, content,
            crawler access, Content-Signal, and Agent Card settings.
          </p>
        </header>

        <section className="studio-connect" aria-labelledby="studio-connect-title">
          <h2 id="studio-connect-title">How to connect an agent</h2>
          <p>
            ChatGPT&apos;s in-app browser opens the Studio directly. In Google
            Chrome 149 or newer, enable{' '}
            <code>chrome://flags/#enable-webmcp-testing</code>, restart Chrome,
            and open this page. Compatible browsers expose the tools through{' '}
            <code>document.modelContext</code>, with a navigator fallback.
          </p>
        </section>

        <CapabilityBanner status={agentStatus} />

        <div className="studio-grid">
          <GlassSurface className="studio-panel-surface" borderRadius={20}>
            <ContractPanel
              draft={draft}
              dispatch={dispatch}
              inspectUrl={inspectUrl}
              setInspectUrl={setInspectUrl}
              inspectPending={inspectPending}
              inspectOutcome={inspectOutcome}
              onInspect={runInspection}
              agentFlash={agentFlash}
            />
          </GlassSurface>

          <GlassSurface className="studio-panel-surface" borderRadius={20}>
            <section className="studio-panel studio-artifacts" aria-labelledby="studio-artifacts-title">
              <div className="studio-panel-heading">
                <div>
                  <p>Live output</p>
                  <h2 id="studio-artifacts-title">ARTIFACTS</h2>
                </div>
                {selectedArtifact.id === 'config' ? (
                  <button
                    className="button button-secondary studio-compact-button"
                    type="button"
                    onClick={downloadConfig}
                  >
                    Download
                  </button>
                ) : null}
              </div>

              <div
                className="studio-tabs"
                role="tablist"
                aria-label="Compiled artifacts"
                onKeyDown={handleArtifactTabKeyDown}
              >
                {artifactTabs.map((tab) => (
                  <button
                    key={tab.id}
                    id={`studio-artifact-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selectedArtifact.id === tab.id}
                    aria-controls="studio-artifact-panel"
                    tabIndex={selectedArtifact.id === tab.id ? 0 : -1}
                    data-artifact-id={tab.id}
                    onClick={() => openArtifact(tab.id)}
                    onFocus={() => openArtifact(tab.id)}
                  >
                    {tab.label}
                    {updatedArtifacts.has(tab.id) ? (
                      <span className="studio-updated-dot" aria-label="Updated" />
                    ) : null}
                  </button>
                ))}
              </div>

              {selectedArtifact.id === 'adapter' ? (
                <label className="studio-field studio-adapter-select" htmlFor="studio-adapter">
                  <span>Framework adapter</span>
                  <select
                    id="studio-adapter"
                    className="checker-input"
                    value={adapter}
                    onChange={(event) => setAdapter(event.target.value as AdapterName)}
                  >
                    {ADAPTERS.map((name) => (
                      <option value={name} key={name}>{name}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div
                id="studio-artifact-panel"
                className="studio-artifact-output"
                role="tabpanel"
                aria-labelledby={`studio-artifact-tab-${selectedArtifact.id}`}
              >
                {selectedArtifact.code.trim() === '' ? (
                  <p className="studio-artifact-empty">
                    Artifacts appear here as the contract fills in. Set your site URL and name to generate the first files.
                  </p>
                ) : (
                  <CodeBlock code={selectedArtifact.code} maxHeight="42rem" />
                )}
              </div>
            </section>
          </GlassSurface>

          <GlassSurface
            className="studio-panel-surface studio-panel-wide"
            borderRadius={20}
          >
            <section className="studio-panel" aria-labelledby="studio-findings-title">
              <div className="studio-panel-heading">
                <div>
                  <p>Deterministic review</p>
                  <h2 id="studio-findings-title">FINDINGS + ACTIVITY</h2>
                </div>
                <div className="studio-finding-counts" aria-label="Finding counts">
                  <span><strong>{errorCount}</strong> {errorCount === 1 ? 'error' : 'errors'}</span>
                  <span><strong>{warningCount}</strong> {warningCount === 1 ? 'warning' : 'warnings'}</span>
                </div>
              </div>

              <div className="studio-review-grid">
                <div className="studio-findings-list">
                  <section aria-labelledby="studio-validation-title">
                    <h3 id="studio-validation-title">Validation</h3>
                    {pristine ? (
                      <p className="studio-empty-state">
                        Set your site URL to begin. Findings appear as the draft changes.
                      </p>
                    ) : compiled.validations.length > 0 ? (
                      <ul>
                        {compiled.validations.map((finding, index) => (
                          <li key={`${finding.severity}-${finding.message}-${index}`}>
                            <span className={`semantic-status semantic-status-${finding.severity === 'error' ? 'action' : 'attention'}`}>
                              <StatusIcon status={finding.severity === 'error' ? 'action' : 'attention'} size={15} />
                              {finding.severity === 'error' ? 'Error' : 'Warning'}
                            </span>
                            <p>{finding.message}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="studio-empty-state">
                        <StatusLabel status="good" /> No validation findings.
                      </p>
                    )}
                  </section>

                  <section aria-labelledby="studio-contradiction-title">
                    <h3 id="studio-contradiction-title">Contradictions</h3>
                    {contradictions.length > 0 ? (
                      <ul>
                        {contradictions.map((finding) => (
                          <li key={finding.code}>
                            <span className={`semantic-status semantic-status-${finding.severity === 'error' ? 'action' : 'attention'}`}>
                              <StatusIcon status={finding.severity === 'error' ? 'action' : 'attention'} size={15} />
                              {finding.code} {finding.severity === 'error' ? 'Error' : 'Warning'}
                            </span>
                            <h4>{finding.title}</h4>
                            <p>{finding.detail}</p>
                            <small>{finding.loci.join(' + ')}</small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="studio-empty-state">
                        <StatusLabel status="good" /> No contradictions detected
                      </p>
                    )}
                  </section>
                </div>

                <section className="studio-activity" aria-labelledby="studio-activity-title">
                  <div className="studio-activity-heading">
                    <h3 id="studio-activity-title">Activity</h3>
                    <div>
                      <button
                        className="button button-secondary studio-compact-button"
                        type="button"
                        data-testid="studio-undo"
                        disabled={state.history.length === 0}
                        onClick={() => dispatch({ type: 'UNDO', source: 'human' })}
                      >
                        Undo
                      </button>
                      <button
                        className="button button-quiet studio-compact-button"
                        type="button"
                        disabled={pristine}
                        onClick={resetDraft}
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  {state.log.length > 0 ? (
                    <ResponsiveTable label="Studio activity log">
                      <thead>
                        <tr>
                          <th>Source</th>
                          <th>Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...state.log].reverse().map((entry) => (
                          <tr className="studio-activity-row" key={entry.seq}>
                            <td>
                              <span className={`studio-source-badge studio-source-${entry.source}`}>
                                {entry.source === 'agent' ? 'Agent' : 'Human'}
                              </span>
                            </td>
                            <td>{entry.summary}</td>
                          </tr>
                        ))}
                      </tbody>
                    </ResponsiveTable>
                  ) : (
                    <p className="studio-empty-copy">
                      Agent and human changes will appear here, newest first.
                    </p>
                  )}
                </section>
              </div>
            </section>
          </GlassSurface>
        </div>

        <ContextualFaq items={STUDIO_FAQS} />
      </article>
    </main>
  );
}

function CapabilityBanner({ status }: { status: AgentStatus }) {
  if (status === 'unknown') {
    return (
      <aside className="studio-capability studio-capability-neutral" aria-live="polite">
        <StatusLabel status="neutral" />
        <div>
          <strong>Agent connection: checking...</strong>
          <p>Manual editing is available while browser capabilities are checked.</p>
        </div>
      </aside>
    );
  }

  if (status.supported && status.registered.length > 0) {
    return (
      <aside className="studio-capability studio-capability-connected" aria-live="polite">
        <StatusLabel status="good" />
        <div>
          <strong>Agent connected: {status.registered.length} tools registered</strong>
          <p>Agent actions and manual edits share the same visible draft and activity log.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="studio-capability studio-capability-neutral" aria-live="polite">
      <StatusLabel status="neutral" />
      <div>
        <strong>No WebMCP agent detected</strong>
        <p>
          Use ChatGPT&apos;s in-app browser or enable the Chrome 149+ WebMCP testing
          flag described above. Every control remains available manually.
        </p>
      </div>
    </aside>
  );
}

function ContractPanel({
  draft,
  dispatch,
  inspectUrl,
  setInspectUrl,
  inspectPending,
  inspectOutcome,
  onInspect,
  agentFlash,
}: {
  draft: StudioDraft;
  dispatch: StudioDispatch;
  inspectUrl: string;
  setInspectUrl: (value: string) => void;
  inspectPending: boolean;
  inspectOutcome: InspectSiteOutcome | null;
  onInspect: () => Promise<void>;
  agentFlash: AgentFlash | null;
}) {
  const setIdentity = (payload: StudioAction & { type: 'SET_IDENTITY' }) =>
    dispatch(payload);
  const organization = draft.identity.organization ?? { name: '', url: '' };

  const updateOrganization = (field: 'name' | 'url', value: string) => {
    setIdentity({
      type: 'SET_IDENTITY',
      source: 'human',
      payload: {
        organization: {
          ...organization,
          [field]: value,
        },
      },
    });
  };

  const updateSections = (llmsSections: LlmsSection[]) => {
    dispatch({
      type: 'CURATE_PAGES',
      source: 'human',
      payload: { llmsSections },
    });
  };

  const updateSection = (index: number, patch: Partial<LlmsSection>) => {
    updateSections(
      draft.content.llmsSections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section
      )
    );
  };

  const setGroupChoice = (group: CrawlerGroupName, choice: GroupChoice) => {
    if (choice === 'unset') {
      dispatch({
        type: 'SET_ACCESS_POLICY',
        source: 'human',
        payload: {
          crawlers: Object.fromEntries(
            CRAWLER_GROUPS[group].map((crawler) => [crawler, null])
          ),
        },
      });
      return;
    }

    dispatch({
      type: 'SET_ACCESS_POLICY',
      source: 'human',
      payload: { groups: { [group]: choice } },
    });
  };

  const interfaces = draft.agentCard.supportedInterfaces ?? [];
  const sectionIds = useStableIds(
    draft.content.llmsSections.length,
    'studio-section-row'
  );
  const interfaceIds = useStableIds(
    interfaces.length,
    'studio-interface-row'
  );
  const updateInterfaces = (supportedInterfaces: AgentInterface[]) => {
    dispatch({
      type: 'SET_AGENT_CARD',
      source: 'human',
      payload: { supportedInterfaces },
    });
  };
  const updateInterface = (index: number, patch: Partial<AgentInterface>) => {
    updateInterfaces(
      interfaces.map((item, currentIndex) =>
        currentIndex === index ? { ...item, ...patch } : item
      )
    );
  };
  const fieldsetClass = (...actionTypes: StudioAction['type'][]) => {
    const shouldFlash = agentFlash !== null && (
      agentFlash.actionType === 'IMPORT_FROM_CHECK' ||
      actionTypes.includes(agentFlash.actionType)
    );
    if (!shouldFlash) {
      return 'studio-fieldset';
    }

    return `studio-fieldset studio-flash studio-flash-${agentFlash.seq % 2 === 0 ? 'even' : 'odd'}`;
  };

  return (
    <section className="studio-panel studio-contract" aria-labelledby="studio-contract-title">
      <div className="studio-panel-heading">
        <div>
          <p>Shared draft</p>
          <h2 id="studio-contract-title">CONTRACT</h2>
        </div>
      </div>

      <fieldset className={fieldsetClass('SET_IDENTITY')}>
        <legend>Identity</legend>
        <label className="studio-field" htmlFor="studio-site">
          <span>Site</span>
          <CommitInput
            id="studio-site"
            className="checker-input"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="https://example.com"
            value={draft.identity.site}
            normalize={normalizeWebsiteInput}
            onCommit={(site) => setIdentity({
              type: 'SET_IDENTITY',
              source: 'human',
              payload: { site },
            })}
          />
        </label>
        <label className="studio-field" htmlFor="studio-name">
          <span>Name</span>
          <CommitInput
            id="studio-name"
            className="checker-input"
            type="text"
            value={draft.identity.name}
            onCommit={(name) => setIdentity({
              type: 'SET_IDENTITY',
              source: 'human',
              payload: { name },
            })}
          />
        </label>
        <label className="studio-field" htmlFor="studio-description">
          <span>Description</span>
          <CommitTextarea
            id="studio-description"
            className="checker-input studio-textarea"
            value={draft.identity.description}
            onCommit={(description) => setIdentity({
              type: 'SET_IDENTITY',
              source: 'human',
              payload: { description },
            })}
          />
        </label>

        <details className="studio-disclosure">
          <summary>Organization (optional)</summary>
          <div className="studio-disclosure-body studio-paired-fields">
            <label className="studio-field" htmlFor="studio-organization-name">
              <span>Organization name</span>
              <CommitInput
                id="studio-organization-name"
                className="checker-input"
                type="text"
                value={organization.name}
                onCommit={(name) => updateOrganization('name', name)}
              />
            </label>
            <label className="studio-field" htmlFor="studio-organization-url">
              <span>Organization URL</span>
              <CommitInput
                id="studio-organization-url"
                className="checker-input"
                type="text"
                inputMode="url"
                value={organization.url}
                normalize={normalizeWebsiteInput}
                onCommit={(url) => updateOrganization('url', url)}
              />
            </label>
          </div>
        </details>
      </fieldset>

      <fieldset className={fieldsetClass('SET_ACCESS_POLICY')}>
        <legend>Access policy</legend>
        <div className="studio-policy-list">
          {(Object.keys(CRAWLER_GROUPS) as CrawlerGroupName[]).map((group) => {
            const choice = getGroupChoice(draft, group);
            return (
              <div className="studio-policy-row" key={group}>
                <span>{group}</span>
                <div className="studio-segmented" aria-label={`${group} crawler policy`}>
                  {([
                    ['allow', 'Allow'],
                    ['disallow', 'Block'],
                    ['unset', 'Unset'],
                  ] as Array<[GroupChoice, string]>).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={choice === value}
                      onClick={() => setGroupChoice(group, value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="studio-signal-grid">
          {([
            ['aiTrain', 'AI training'],
            ['search', 'Search'],
            ['aiInput', 'AI input'],
          ] as const).map(([key, label]) => (
            <label className="studio-field" key={key} htmlFor={`studio-signal-${key}`}>
              <span>{label}</span>
              <select
                id={`studio-signal-${key}`}
                className="checker-input"
                value={draft.access.contentSignal[key]}
                onChange={(event) => dispatch({
                  type: 'SET_ACCESS_POLICY',
                  source: 'human',
                  payload: {
                    contentSignal: { [key]: event.target.value as 'yes' | 'no' },
                  },
                })}
              >
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={fieldsetClass('CURATE_PAGES')}>
        <legend>Content</legend>
        <div className="studio-subsection-heading">
          <span>llms.txt sections</span>
          <button
            className="button button-secondary studio-compact-button"
            type="button"
            disabled={draft.content.llmsSections.length >= LIMITS.sectionsMax}
            onClick={() => {
              sectionIds.appendId();
              updateSections([
                ...draft.content.llmsSections,
                { title: '', entries: [] },
              ]);
            }}
          >
            Add section
          </button>
        </div>

        <div className="studio-repeat-list">
          {sectionIds.ids.map((rowId, sectionIndex) => {
            const section = draft.content.llmsSections[sectionIndex];
            return section ? (
              <LlmsSectionEditor
                key={rowId}
                rowId={rowId}
                section={section}
                sectionIndex={sectionIndex}
                onUpdate={(patch) => updateSection(sectionIndex, patch)}
                onRemove={() => {
                  sectionIds.removeIdAt(sectionIndex);
                  updateSections(
                    draft.content.llmsSections.filter((_, index) => index !== sectionIndex)
                  );
                }}
              />
            ) : null;
          })}
        </div>

        <EditableStringList
          idPrefix="studio-when"
          label="When to use"
          values={draft.content.whenToUse}
          max={LIMITS.whenToUseMax}
          addLabel="Add guidance"
          onChange={(whenToUse) => dispatch({
            type: 'CURATE_PAGES',
            source: 'human',
            payload: { whenToUse },
          })}
        />

        <label className="studio-toggle" htmlFor="studio-llms-full">
          <input
            id="studio-llms-full"
            type="checkbox"
            checked={draft.content.llmsFullEnabled}
            onChange={(event) => dispatch({
              type: 'CURATE_PAGES',
              source: 'human',
              payload: { llmsFullEnabled: event.target.checked },
            })}
          />
          <span>Generate llms-full.txt</span>
        </label>

        <label className="studio-toggle" htmlFor="studio-markdown-mirrors">
          <input
            id="studio-markdown-mirrors"
            type="checkbox"
            checked={draft.content.markdownMirrors.enabled}
            onChange={(event) => dispatch({
              type: 'CURATE_PAGES',
              source: 'human',
              payload: {
                markdownMirrors: {
                  ...draft.content.markdownMirrors,
                  enabled: event.target.checked,
                },
              },
            })}
          />
          <span>Generate markdown mirrors</span>
        </label>

        {draft.content.markdownMirrors.enabled ? (
          <EditableStringList
            idPrefix="studio-exclude"
            label="Mirror exclude patterns"
            values={draft.content.markdownMirrors.exclude}
            max={LIMITS.excludeMax}
            addLabel="Add exclusion"
            onChange={(exclude) => dispatch({
              type: 'CURATE_PAGES',
              source: 'human',
              payload: {
                markdownMirrors: {
                  ...draft.content.markdownMirrors,
                  exclude,
                },
              },
            })}
          />
        ) : null}
      </fieldset>

      <fieldset className={fieldsetClass('SET_AGENT_CARD')}>
        <legend>Agent card</legend>
        <label className="studio-toggle" htmlFor="studio-agent-card-enabled">
          <input
            id="studio-agent-card-enabled"
            type="checkbox"
            checked={draft.agentCard.enabled}
            onChange={(event) => dispatch({
              type: 'SET_AGENT_CARD',
              source: 'human',
              payload: {
                enabled: event.target.checked,
                ...(event.target.checked && interfaces.length === 0
                  ? {
                      supportedInterfaces: [{
                        url: '',
                        protocolBinding: 'HTTP+JSON',
                        protocolVersion: '1.0',
                      }],
                    }
                  : {}),
              },
            })}
          />
          <span>Publish an Agent Card</span>
        </label>

        {draft.agentCard.enabled ? (
          <div className="studio-agent-card-fields">
            <div className="studio-paired-fields">
              <label className="studio-field" htmlFor="studio-agent-version">
                <span>Version</span>
                <CommitInput
                  id="studio-agent-version"
                  className="checker-input"
                  type="text"
                  value={draft.agentCard.version ?? ''}
                  onCommit={(version) => dispatch({
                    type: 'SET_AGENT_CARD',
                    source: 'human',
                    payload: { version },
                  })}
                />
              </label>
              <label className="studio-field" htmlFor="studio-agent-description">
                <span>Description</span>
                <CommitInput
                  id="studio-agent-description"
                  className="checker-input"
                  type="text"
                  value={draft.agentCard.description ?? ''}
                  onCommit={(description) => dispatch({
                    type: 'SET_AGENT_CARD',
                    source: 'human',
                    payload: { description },
                  })}
                />
              </label>
            </div>

            <div className="studio-subsection-heading">
              <span>Supported interfaces</span>
              <button
                className="button button-secondary studio-compact-button"
                type="button"
                disabled={interfaces.length >= LIMITS.interfacesMax}
                onClick={() => {
                  interfaceIds.appendId();
                  updateInterfaces([
                    ...interfaces,
                    { url: '', protocolBinding: 'HTTP+JSON', protocolVersion: '1.0' },
                  ]);
                }}
              >
                Add interface
              </button>
            </div>

            <div className="studio-repeat-list">
              {interfaceIds.ids.map((rowId, index) => {
                const item = interfaces[index];
                return item ? (
                <div className="studio-interface-row" key={rowId}>
                  <label className="studio-field" htmlFor={`studio-interface-url-${index}`}>
                    <span>URL</span>
                    <CommitInput
                      id={`studio-interface-url-${index}`}
                      className="checker-input"
                      type="text"
                      inputMode="url"
                      value={item.url}
                      onCommit={(url) => updateInterface(index, { url })}
                    />
                  </label>
                  <label className="studio-field" htmlFor={`studio-interface-binding-${index}`}>
                    <span>Protocol binding</span>
                    <CommitInput
                      id={`studio-interface-binding-${index}`}
                      className="checker-input"
                      type="text"
                      value={item.protocolBinding}
                      onCommit={(protocolBinding) => updateInterface(index, {
                        protocolBinding,
                      })}
                    />
                  </label>
                  <label className="studio-field" htmlFor={`studio-interface-version-${index}`}>
                    <span>Protocol version</span>
                    <CommitInput
                      id={`studio-interface-version-${index}`}
                      className="checker-input"
                      type="text"
                      value={item.protocolVersion}
                      onCommit={(protocolVersion) => updateInterface(index, {
                        protocolVersion,
                      })}
                    />
                  </label>
                  <button
                    className="button button-quiet studio-compact-button"
                    type="button"
                    disabled={interfaces.length <= 1}
                    onClick={() => {
                      interfaceIds.removeIdAt(index);
                      updateInterfaces(
                        interfaces.filter((_, currentIndex) => currentIndex !== index)
                      );
                    }}
                  >
                    Remove
                  </button>
                </div>
                ) : null;
              })}
            </div>

            <div className="studio-paired-fields">
              <label className="studio-field" htmlFor="studio-provider-organization">
                <span>Provider organization</span>
                <CommitInput
                  id="studio-provider-organization"
                  className="checker-input"
                  type="text"
                  value={draft.agentCard.providerOrganization ?? ''}
                  onCommit={(providerOrganization) => dispatch({
                    type: 'SET_AGENT_CARD',
                    source: 'human',
                    payload: { providerOrganization },
                  })}
                />
              </label>
              <label className="studio-field" htmlFor="studio-provider-url">
                <span>Provider URL</span>
                <CommitInput
                  id="studio-provider-url"
                  className="checker-input"
                  type="text"
                  inputMode="url"
                  value={draft.agentCard.providerUrl ?? ''}
                  onCommit={(providerUrl) => dispatch({
                    type: 'SET_AGENT_CARD',
                    source: 'human',
                    payload: { providerUrl },
                  })}
                />
              </label>
            </div>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="studio-fieldset studio-inspect">
        <legend>Inspect intake</legend>
        <p>
          Inspect an existing public site and import a bounded starting point.
        </p>
        <div className="studio-inspect-row">
          <label className="studio-field" htmlFor="studio-inspect-url">
            <span>Public site URL</span>
            <CommitInput
              id="studio-inspect-url"
              className="checker-input"
              type="text"
              inputMode="url"
              placeholder="example.com"
              value={inspectUrl}
              normalize={normalizeWebsiteInput}
              onCommit={setInspectUrl}
            />
          </label>
          <button
            className="button button-primary"
            type="button"
            disabled={inspectPending}
            onClick={() => void onInspect()}
          >
            {inspectPending ? 'Inspecting...' : 'Inspect site'}
          </button>
        </div>

        {inspectOutcome ? (
          <div
            className={`studio-inspect-result studio-inspect-result-${inspectOutcome.ok ? 'good' : 'attention'}`}
            role="status"
          >
            <p>{inspectOutcome.summaryText}</p>
            {inspectOutcome.humanActionNeeded === 'turnstile' ? (
              <p><a href="/checker/">Complete verification in the website checker</a>, then return and inspect again.</p>
            ) : null}
            {inspectOutcome.findings?.length ? (
              <ul>
                {inspectOutcome.findings.map((finding, index) => (
                  <li key={`${finding.level}-${finding.title}-${index}`}>
                    <strong>{finding.level}:</strong> {finding.title}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </fieldset>
    </section>
  );
}

function LlmsSectionEditor({
  rowId,
  section,
  sectionIndex,
  onUpdate,
  onRemove,
}: {
  rowId: string;
  section: LlmsSection;
  sectionIndex: number;
  onUpdate: (patch: Partial<LlmsSection>) => void;
  onRemove: () => void;
}) {
  const entryIds = useStableIds(
    section.entries.length,
    `${rowId}-entry`
  );
  const updateEntry = (entryIndex: number, patch: Partial<LlmsEntry>) => {
    onUpdate({
      entries: section.entries.map((entry, currentIndex) =>
        currentIndex === entryIndex ? { ...entry, ...patch } : entry
      ),
    });
  };

  return (
    <div className="studio-repeat-card">
      <div className="studio-inline-field">
        <label className="studio-field" htmlFor={`studio-section-${sectionIndex}`}>
          <span>Section title</span>
          <CommitInput
            id={`studio-section-${sectionIndex}`}
            className="checker-input"
            type="text"
            value={section.title}
            onCommit={(title) => onUpdate({ title })}
          />
        </label>
        <button
          className="button button-quiet studio-compact-button"
          type="button"
          onClick={onRemove}
        >
          Remove
        </button>
      </div>

      {entryIds.ids.map((rowId, entryIndex) => {
        const entry = section.entries[entryIndex];
        return entry ? (
        <div className="studio-entry-row" key={rowId}>
          <label className="studio-field" htmlFor={`studio-entry-title-${sectionIndex}-${entryIndex}`}>
            <span>Entry title</span>
            <CommitInput
              id={`studio-entry-title-${sectionIndex}-${entryIndex}`}
              className="checker-input"
              type="text"
              value={entry.title}
              onCommit={(title) => updateEntry(entryIndex, { title })}
            />
          </label>
          <label className="studio-field" htmlFor={`studio-entry-url-${sectionIndex}-${entryIndex}`}>
            <span>URL</span>
            <CommitInput
              id={`studio-entry-url-${sectionIndex}-${entryIndex}`}
              className="checker-input"
              type="text"
              inputMode="url"
              value={entry.url}
              onCommit={(url) => updateEntry(entryIndex, { url })}
            />
          </label>
          <label className="studio-field studio-entry-description" htmlFor={`studio-entry-description-${sectionIndex}-${entryIndex}`}>
            <span>Description</span>
            <CommitInput
              id={`studio-entry-description-${sectionIndex}-${entryIndex}`}
              className="checker-input"
              type="text"
              value={entry.description ?? ''}
              onCommit={(description) => updateEntry(entryIndex, { description })}
            />
          </label>
          <button
            className="button button-quiet studio-compact-button"
            type="button"
            onClick={() => {
              entryIds.removeIdAt(entryIndex);
              onUpdate({
                entries: section.entries.filter(
                  (_, currentIndex) => currentIndex !== entryIndex
                ),
              });
            }}
          >
            Remove entry
          </button>
        </div>
        ) : null;
      })}

      <button
        className="button button-secondary studio-compact-button"
        type="button"
        disabled={section.entries.length >= LIMITS.entriesPerSectionMax}
        onClick={() => {
          entryIds.appendId();
          onUpdate({
            entries: [
              ...section.entries,
              { title: '', url: '', description: '' },
            ],
          });
        }}
      >
        Add entry
      </button>
    </div>
  );
}

function EditableStringList({
  idPrefix,
  label,
  values,
  max,
  addLabel,
  onChange,
}: {
  idPrefix: string;
  label: string;
  values: string[];
  max: number;
  addLabel: string;
  onChange: (values: string[]) => void;
}) {
  const rowIds = useStableIds(values.length, `${idPrefix}-row`);

  return (
    <div className="studio-string-list">
      <div className="studio-subsection-heading">
        <span>{label}</span>
        <button
          className="button button-secondary studio-compact-button"
          type="button"
          disabled={values.length >= max}
          onClick={() => {
            rowIds.appendId();
            onChange([...values, '']);
          }}
        >
          {addLabel}
        </button>
      </div>
      {rowIds.ids.map((rowId, index) => {
        const value = values[index];
        return value !== undefined ? (
        <div className="studio-inline-field" key={rowId}>
          <label className="studio-field studio-visually-labelled" htmlFor={`${idPrefix}-${index}`}>
            <span>{label} {index + 1}</span>
            <CommitInput
              id={`${idPrefix}-${index}`}
              className="checker-input"
              type="text"
              value={value}
              onCommit={(nextValue) => onChange(
                values.map((item, currentIndex) =>
                  currentIndex === index ? nextValue : item
                )
              )}
            />
          </label>
          <button
            className="button button-quiet studio-compact-button"
            type="button"
            onClick={() => {
              rowIds.removeIdAt(index);
              onChange(values.filter((_, currentIndex) => currentIndex !== index));
            }}
          >
            Remove
          </button>
        </div>
        ) : null;
      })}
    </div>
  );
}

export default Studio;
