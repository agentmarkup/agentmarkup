import { markdownHrefForPagePath } from '../html.js';

export interface PageMarkdownOptions {
  html: string;
  pagePath?: string;
  siteUrl?: string;
}

interface HeadMetadata {
  title: string | null;
  description: string | null;
  canonical: string | null;
}

const PRE_BLOCK_RE = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
const TAGS_TO_REMOVE_RE =
  /<(script|style|template|svg|canvas|iframe|form|button)\b[^>]*>[\s\S]*?<\/\1>/gi;
const LAYOUT_TAGS_RE = /<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi;
const NOSCRIPT_RE = /<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi;
const UI_CHROME_RE = [
  /<button\b[^>]*class=(['"])[^'"]*copy-btn[^'"]*\1[^>]*>[\s\S]*?<\/button>/gi,
  /<span\b[^>]*class=(['"])[^'"]*line-numbers[^'"]*\1[^>]*>[\s\S]*?<\/span>/gi,
  /<span\b[^>]*>\s*\d+\s*<\/span>/gi,
  /<[^>]+\baria-hidden=(['"])true\1[^>]*>[\s\S]*?<\/[^>]+>/gi,
];
const ENTITY_MAP: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  middot: '·',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

export function generatePageMarkdown(options: PageMarkdownOptions): string {
  const metadata = extractHeadMetadata(options.html);
  const contentHtml = extractContentHtml(options.html);
  const markdownBody = htmlFragmentToMarkdown(contentHtml);
  const lines: string[] = [];
  const sourceUrl = resolveSourceUrl(options, metadata);

  if (metadata.title) {
    lines.push(`# ${metadata.title}`);
  }

  if (metadata.description) {
    lines.push('');
    lines.push(`> ${metadata.description}`);
  }

  if (sourceUrl) {
    lines.push('');
    lines.push(`Source: ${sourceUrl}`);
  }

  const normalizedBody = stripDuplicateTitle(markdownBody, metadata.title);
  if (normalizedBody) {
    lines.push('');
    lines.push(normalizedBody);
  }

  const output = lines.join('\n').trim();
  return output ? `${output}\n` : '';
}

export function generateMarkdownAlternateLink(pagePath: string): string {
  const href = markdownHrefForPagePath(pagePath);
  return `<link rel="alternate" type="text/markdown" href="${escapeAttribute(
    href
  )}" title="Markdown version of this page" />`;
}

function resolveSourceUrl(
  options: PageMarkdownOptions,
  metadata: HeadMetadata
): string | null {
  if (metadata.canonical) {
    return metadata.canonical;
  }

  if (!options.pagePath || !options.siteUrl) {
    return null;
  }

  const base = options.siteUrl.replace(/\/$/, '');
  return options.pagePath === '/' ? `${base}/` : `${base}${options.pagePath}`;
}

function extractHeadMetadata(html: string): HeadMetadata {
  return {
    title: extractHeadValue(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i),
    description: extractHeadValue(
      html,
      /<meta\b[^>]*name=(['"])description\1[^>]*content=(['"])([\s\S]*?)\2[^>]*>/i,
      3
    ),
    canonical: extractHeadValue(
      html,
      /<link\b[^>]*rel=(['"])canonical\1[^>]*href=(['"])([\s\S]*?)\2[^>]*>/i,
      3
    ),
  };
}

function extractHeadValue(
  html: string,
  pattern: RegExp,
  groupIndex = 1
): string | null {
  const match = html.match(pattern);
  if (!match) {
    return null;
  }

  const value = decodeHtmlEntities(match[groupIndex].trim());
  return value || null;
}

function extractContentHtml(html: string): string {
  const main = extractTagInnerHtml(html, 'main');
  if (main) {
    return cleanContentHtml(main);
  }

  const article = extractTagInnerHtml(html, 'article');
  if (article) {
    return cleanContentHtml(article);
  }

  const body = extractTagInnerHtml(html, 'body');
  if (!body) {
    return '';
  }

  const cleanedBody = cleanContentHtml(body);
  if (hasMeaningfulText(cleanedBody)) {
    return cleanedBody;
  }

  const noscriptMatches = Array.from(body.matchAll(NOSCRIPT_RE));
  const noscriptFallback = noscriptMatches
    .map((match) => cleanContentHtml(match[1]))
    .find((fragment) => hasMeaningfulText(fragment));

  return noscriptFallback ?? cleanedBody;
}

function cleanContentHtml(html: string): string {
  let cleaned = html
    .replace(TAGS_TO_REMOVE_RE, '')
    .replace(LAYOUT_TAGS_RE, '')
    .trim();

  for (const pattern of UI_CHROME_RE) {
    cleaned = cleaned.replace(pattern, '');
  }

  return cleaned.trim();
}

function hasMeaningfulText(html: string): boolean {
  const text = stripTags(html).replace(/\s+/g, ' ').trim();
  return text.length >= 40;
}

function extractTagInnerHtml(html: string, tagName: string): string | null {
  const match = html.match(
    new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i')
  );

  return match ? match[1] : null;
}

function htmlFragmentToMarkdown(html: string): string {
  if (!html) {
    return '';
  }

  const preBlocks: string[] = [];
  let working = html.replace(PRE_BLOCK_RE, (_match, inner) => {
    const fence = `@@AGENTMARKUP_PRE_${preBlocks.length}@@`;
    const codeBlock = extractCodeBlock(inner);
    const fenceMarker = codeBlock.language
      ? `\n\`\`\`${codeBlock.language}\n${codeBlock.code}\n\`\`\`\n`
      : `\n\`\`\`\n${codeBlock.code}\n\`\`\`\n`;
    preBlocks.push(codeBlock.code ? fenceMarker : '');
    return fence;
  });

  working = working
    .replace(/<(section|article|main|div|figure)\b[^>]*>/gi, '\n\n')
    .replace(/<\/(section|article|main|div|figure)>/gi, '\n\n')
    .replace(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, tag, inner) => {
      const level = Number(tag.slice(1));
      return `\n\n${'#'.repeat(level)} ${renderInline(inner)}\n\n`;
    })
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_match, inner) => {
      const content = renderInline(inner)
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `> ${line}`)
        .join('\n');
      return content ? `\n\n${content}\n\n` : '\n\n';
    })
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, inner) => {
      const content = renderInline(inner);
      return content ? `- ${content}\n` : '';
    })
    .replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, inner) => {
      return `\n${inner}\n`;
    })
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_match, inner) => {
      const content = renderInline(inner);
      return content ? `\n\n${content}\n\n` : '\n\n';
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n\n---\n\n');

  working = stripResidualTagsPreservingMarkdown(working);

  for (let index = 0; index < preBlocks.length; index += 1) {
    working = working.replace(`@@AGENTMARKUP_PRE_${index}@@`, preBlocks[index]);
  }

  return normalizeMarkdown(working);
}

function renderInline(html: string): string {
  const inlineCodeTokens: string[] = [];
  let working = html.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner) => {
    const token = `@@AGENTMARKUP_CODE_${inlineCodeTokens.length}@@`;
    const code = decodeHtmlEntities(stripTags(inner)).trim();
    inlineCodeTokens.push(code ? `\`${code}\`` : '');
    return token;
  });

  working = working
    .replace(/<a\b[^>]*href=(['"])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, href, inner) => {
      const label = stripTags(inner).replace(/\s+/g, ' ').trim();
      const normalizedHref = decodeHtmlEntities(href.trim());
      return label && normalizedHref ? `[${label}](${normalizedHref})` : label;
    })
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) => {
      const label = stripTags(inner).replace(/\s+/g, ' ').trim();
      return label ? `**${label}**` : '';
    })
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) => {
      const label = stripTags(inner).replace(/\s+/g, ' ').trim();
      return label ? `*${label}*` : '';
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(span|small|sup|sub)\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  working = decodeHtmlEntities(working);

  for (let index = 0; index < inlineCodeTokens.length; index += 1) {
    working = working.replace(
      `@@AGENTMARKUP_CODE_${index}@@`,
      inlineCodeTokens[index]
    );
  }

  return normalizeInlineText(working);
}

function stripResidualTagsPreservingMarkdown(markdownishHtml: string): string {
  const preservedBlocks: string[] = [];
  let working = markdownishHtml
    .replace(/```[\s\S]*?```/g, (match) => {
      const token = `@@AGENTMARKUP_BLOCK_${preservedBlocks.length}@@`;
      preservedBlocks.push(match);
      return token;
    })
    .replace(/`[^`\n]+`/g, (match) => {
      const token = `@@AGENTMARKUP_BLOCK_${preservedBlocks.length}@@`;
      preservedBlocks.push(match);
      return token;
    });

  working = decodeHtmlEntities(
    working
      .replace(/<\/?(span|small|sup|sub)\b[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );

  for (let index = 0; index < preservedBlocks.length; index += 1) {
    working = working.replace(
      `@@AGENTMARKUP_BLOCK_${index}@@`,
      preservedBlocks[index]
    );
  }

  return working;
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n[ \t]+-/g, '\n-')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizeInlineText(value: string): string {
  return value
    .replace(/\r/g, '')
    .split('\n')
    .map((line) =>
      line
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim()
    )
    .join('\n')
    .trim();
}

function stripDuplicateTitle(markdown: string, title: string | null): string {
  if (!markdown || !title) {
    return markdown;
  }

  const duplicateHeading = `# ${title}`.toLowerCase();
  if (!markdown.toLowerCase().startsWith(duplicateHeading)) {
    return markdown;
  }

  return markdown
    .split('\n')
    .slice(1)
    .join('\n')
    .trim();
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, '');
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity) => {
    const normalized = entity.toLowerCase();

    if (normalized.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
    }

    if (normalized.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
    }

    return ENTITY_MAP[normalized] ?? `&${entity};`;
  });
}

function extractCodeBlock(innerHtml: string): {
  code: string;
  language: string | null;
} {
  const languageMatch = innerHtml.match(
    /\b(?:language|lang)-([a-z0-9#+-]+)/i
  );
  const withoutLineNumbers = innerHtml
    .replace(
      /<span\b[^>]*class=(['"])[^'"]*line-numbers[^'"]*\1[^>]*>[\s\S]*?<\/span>/gi,
      ''
    )
    .replace(/<[^>]+\baria-hidden=(['"])true\1[^>]*>[\s\S]*?<\/[^>]+>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n');

  const code = normalizeCodeBlockText(
    decodeHtmlEntities(stripTags(withoutLineNumbers))
  );

  return {
    code,
    language: languageMatch?.[1]?.toLowerCase() ?? null,
  };
}

function normalizeCodeBlockText(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function escapeAttribute(value: string): string {
  return value.replace(/"/g, '&quot;');
}
