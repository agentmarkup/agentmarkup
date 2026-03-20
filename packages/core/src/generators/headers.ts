import type { ContentSignalHeadersConfig } from '../types.js';

const MARKER_START = '# BEGIN agentmarkup Content-Signal';
const MARKER_END = '# END agentmarkup Content-Signal';

export function generateContentSignalHeaderValue(
  config: ContentSignalHeadersConfig = {}
): string {
  const aiTrain = config.aiTrain ?? 'yes';
  const search = config.search ?? 'yes';
  const aiInput = config.aiInput ?? 'yes';

  return `ai-train=${aiTrain}, search=${search}, ai-input=${aiInput}`;
}

export function generateContentSignalHeaders(
  config: ContentSignalHeadersConfig = {}
): string {
  const path = config.path ?? '/*';
  const value = generateContentSignalHeaderValue(config);

  return [
    MARKER_START,
    path,
    `  Content-Signal: ${value}`,
    MARKER_END,
  ].join('\n');
}

export function patchHeadersFile(
  existing: string | null,
  config: ContentSignalHeadersConfig = {}
): string {
  const block = generateContentSignalHeaders(config);

  if (!existing) {
    return `${block}\n`;
  }

  const startIdx = existing.indexOf(MARKER_START);
  const endIdx = existing.indexOf(MARKER_END);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.slice(0, startIdx).trimEnd();
    const after = existing.slice(endIdx + MARKER_END.length).trimStart();
    const parts = [before, block, after].filter(Boolean);
    return `${parts.join('\n\n')}\n`;
  }

  if (hasMatchingContentSignalHeaders(existing, config)) {
    return existing;
  }

  return `${existing.trimEnd()}\n\n${block}\n`;
}

function hasMatchingContentSignalHeaders(
  existing: string,
  config: ContentSignalHeadersConfig
): boolean {
  const path = (config.path ?? '/*').trim();
  const expectedValue = generateContentSignalHeaderValue(config).toLowerCase();
  const lines = existing.split('\n');

  let currentPath: string | null = null;
  let hasExpectedValue = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      currentPath = null;
      continue;
    }

    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      currentPath = trimmed;
      continue;
    }

    if (
      currentPath === path &&
      /^Content-Signal:/i.test(trimmed) &&
      trimmed.slice('Content-Signal:'.length).trim().toLowerCase() === expectedValue
    ) {
      hasExpectedValue = true;
    }
  }

  return hasExpectedValue;
}
