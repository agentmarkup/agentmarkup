// identity: meta.completeness, meta.noindex, jsonld.identity, jsonld.org-completeness,
// jsonld.same-as, jsonld.type-breadth, jsonld.syntax, trust.anchors.
import { BASELINE_JSONLD_TYPES, IDENTITY_TYPES, NON_ORGANIZATION_IDENTITY_TYPES } from '../catalog.js';
import {
  collectLinkTags,
  findAllMetaContent,
  findHtmlLang,
  findMetaContent,
  jsonLdTypes,
  type JsonLdNode,
} from '../html-lite.js';
import { notApplicable, scored, type EvaluatorEntry, type EvaluationContext } from './shared.js';

const IDENTITY_SUFFIXES = ['Business', 'Organization', 'Store', 'Service'];
const IDENTITY_SET = new Set<string>(IDENTITY_TYPES);
const NON_ORGANIZATION_SET = new Set<string>(NON_ORGANIZATION_IDENTITY_TYPES);
const BASELINE_SET = new Set<string>(BASELINE_JSONLD_TYPES);

function matchesIdentityType(type: string): boolean {
  if (IDENTITY_SET.has(type)) {
    return true;
  }
  return IDENTITY_SUFFIXES.some((suffix) => type.length > suffix.length && type.endsWith(suffix));
}

export function isIdentityNode(node: JsonLdNode): boolean {
  return jsonLdTypes(node).some(matchesIdentityType);
}

export function isOrganizationNode(node: JsonLdNode): boolean {
  return jsonLdTypes(node).some((type) => matchesIdentityType(type) && !NON_ORGANIZATION_SET.has(type));
}

function hasValue(node: JsonLdNode, key: string): boolean {
  const value = node[key];
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return typeof value === 'object' && value !== null;
}

function identityNodes(context: EvaluationContext): JsonLdNode[] {
  return context.homepage.jsonLd.nodes.filter(isIdentityNode);
}

function typeLabel(node: JsonLdNode): string {
  return jsonLdTypes(node).join('/') || 'untyped';
}

function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

function canonicalIsSelf(href: string, homepageUrl: string): boolean {
  try {
    const canonical = new URL(href, homepageUrl);
    const home = new URL(homepageUrl);
    return (
      canonical.protocol === home.protocol &&
      canonical.hostname.toLowerCase() === home.hostname.toLowerCase() &&
      normalizePath(canonical.pathname) === normalizePath(home.pathname)
    );
  } catch {
    return false;
  }
}

function robotsDirectiveBlocks(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const tokens = value.toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (tokens.includes('noindex')) return 'noindex';
  if (tokens.includes('none')) return 'none';
  return null;
}

type AnchorKind = 'about' | 'contact' | 'privacy';

const ANCHOR_PATH_RULES: Array<[AnchorKind, RegExp]> = [
  ['about', /^(?:about(?:-us|-me)?|who-we-are|our-story)$/],
  ['contact', /^(?:contact(?:-us)?|get-in-touch)$/],
  ['privacy', /^(?:privacy(?:-policy|-notice)?)$/],
];
const ANCHOR_TEXT_RULES: Array<[AnchorKind, Set<string>]> = [
  ['about', new Set(['about', 'about us'])],
  ['contact', new Set(['contact', 'contact us'])],
  ['privacy', new Set(['privacy', 'privacy policy'])],
];

export const identityEvaluators: Record<string, EvaluatorEntry> = {
  'meta.completeness': {
    needsHomepage: true,
    run: (context) => {
      const head = context.homepage.head;
      const canonical = collectLinkTags(head).find((link) => link.rel.includes('canonical') && link.href);
      const canonicalSelf = Boolean(canonical?.href && canonicalIsSelf(canonical.href, context.homepageUrl));
      const lang = findHtmlLang(context.homepage.body);
      const ogImage = (findMetaContent(head, 'og:image', 'property') ?? '').trim();
      const ogType = (findMetaContent(head, 'og:type', 'property') ?? '').trim();
      const present = [canonicalSelf, Boolean(lang), Boolean(ogImage), Boolean(ogType)].filter(Boolean).length;
      const evidence = [
        canonical?.href
          ? `canonical ${canonical.href} ${canonicalSelf ? 'resolves to the homepage' : 'does not resolve to the homepage'}`
          : 'no canonical link',
        lang ? `html lang=${lang}` : 'no html lang',
        ogImage ? `og:image ${ogImage}` : 'no og:image',
        ogType ? `og:type ${ogType}` : 'no og:type',
        `${present}/4 present`,
      ].join('; ');
      return scored(present / 4, evidence, ['homepage']);
    },
  },
  'meta.noindex': {
    needsHomepage: true,
    run: (context) => {
      const head = context.homepage.head;
      const findings: string[] = [];
      // Every robots, googlebot and bingbot meta tag counts, not only the first.
      for (const name of ['robots', 'googlebot', 'bingbot']) {
        for (const content of findAllMetaContent(head, name, 'name')) {
          const directive = robotsDirectiveBlocks(content);
          if (directive) {
            findings.push(`meta ${name} contains ${directive}`);
            break;
          }
        }
      }
      const headerValue = context.homepage.resource?.xRobotsTag ?? context.homepage.header('x-robots-tag');
      const headerDirective = robotsDirectiveBlocks(headerValue ?? null);
      if (headerDirective) {
        findings.push(`X-Robots-Tag "${headerValue}" contains ${headerDirective}`);
      }
      if (findings.length > 0) {
        return scored(0, findings.join('; '), ['homepage']);
      }
      return scored(1, 'no noindex or none directive in meta robots, googlebot, bingbot or X-Robots-Tag', ['homepage']);
    },
  },
  'jsonld.identity': {
    needsHomepage: true,
    run: (context) => {
      const summary = context.homepage.jsonLd;
      const candidates = identityNodes(context);
      if (candidates.length === 0) {
        const parseable = summary.blocks.filter((block) => block.ok).length;
        return scored(
          0,
          summary.blocks.length === 0
            ? 'no JSON-LD block on the homepage'
            : `${parseable}/${summary.blocks.length} JSON-LD blocks parse, no identity node among ${summary.nodes.length} nodes`,
          ['homepage']
        );
      }
      const fields = ['name', 'url', 'description'];
      const best = candidates.reduce((top, node) =>
        fields.filter((field) => hasValue(node, field)).length > fields.filter((field) => hasValue(top, field)).length
          ? node
          : top
      );
      const present = fields.filter((field) => hasValue(best, field));
      const missing = fields.filter((field) => !hasValue(best, field));
      const evidence = [
        `${typeLabel(best)} node${typeof best.name === 'string' ? ` "${best.name}"` : ''}`,
        present.length > 0 ? `has ${present.join(', ')}` : 'has none of name, url, description',
        missing.length > 0 ? `missing ${missing.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; ');
      return scored((1 + present.length) / 4, evidence, ['homepage']);
    },
  },
  'jsonld.org-completeness': {
    needsHomepage: true,
    run: (context) => {
      const candidates = identityNodes(context);
      const organizations = candidates.filter(isOrganizationNode);
      if (organizations.length === 0) {
        if (candidates.length > 0 && candidates.every((node) => jsonLdTypes(node).includes('Person'))) {
          return notApplicable(
            'identity-is-person',
            `the only identity node is ${typeLabel(candidates[0])}`,
            ['homepage']
          );
        }
        return scored(0, 'no Organization or LocalBusiness node', ['homepage']);
      }
      let best: { node: JsonLdNode; fraction: number; evidence: string; variant: string | undefined } | null = null;
      for (const node of organizations) {
        const address = node.address;
        const addressNodes = Array.isArray(address) ? address : [address];
        const addressOk = addressNodes.some(
          (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            !Array.isArray(entry) &&
            jsonLdTypes(entry as JsonLdNode).some((type) => type.endsWith('Address')) &&
            (hasValue(entry as JsonLdNode, 'streetAddress') || hasValue(entry as JsonLdNode, 'addressLocality'))
        );
        const contact = node.contactPoint;
        const contactNodes = (Array.isArray(contact) ? contact : [contact]).filter(
          (entry): entry is JsonLdNode => typeof entry === 'object' && entry !== null && !Array.isArray(entry)
        );
        const contactOk = contactNodes.some((entry) => hasValue(entry, 'telephone') || hasValue(entry, 'email'));
        const contactLabel = contactNodes.length > 0 ? 'contactPoint without telephone or email' : 'no contactPoint';
        const topLevel = hasValue(node, 'telephone') || hasValue(node, 'email');
        const fraction = (addressOk ? 0.5 : 0) + (contactOk ? 0.5 : topLevel ? 0.25 : 0);
        const evidence = [
          `${typeLabel(node)} node`,
          addressOk ? 'PostalAddress with streetAddress or addressLocality' : 'no usable address',
          contactOk
            ? 'contactPoint with telephone or email'
            : topLevel
              ? `${contactLabel}, top-level telephone or email only`
              : `${contactLabel}, no top-level telephone or email`,
        ].join('; ');
        // A partial result names what is actually missing (catalog variants).
        const variant =
          fraction <= 0 || fraction >= 1
            ? undefined
            : !addressOk
              ? 'no-address'
              : topLevel
                ? 'no-contact-point'
                : 'no-contact';
        if (!best || fraction > best.fraction) {
          best = { node, fraction, evidence, variant };
        }
      }
      return scored(best!.fraction, best!.evidence, ['homepage'], { sentenceVariant: best!.variant });
    },
  },
  'jsonld.same-as': {
    needsHomepage: true,
    run: (context) => {
      const candidates = identityNodes(context);
      if (candidates.length === 0) {
        return notApplicable('no-identity-node', 'no identity node in the homepage JSON-LD', ['homepage']);
      }
      let bestCount = 0;
      let bestNode = candidates[0];
      for (const node of candidates) {
        const sameAs = node.sameAs;
        const list = Array.isArray(sameAs) ? sameAs : sameAs === undefined ? [] : [sameAs];
        const count = list.filter((entry) => typeof entry === 'string' && /^https?:\/\//i.test(entry)).length;
        if (count > bestCount) {
          bestCount = count;
          bestNode = node;
        }
      }
      return scored(
        bestCount >= 2 ? 1 : bestCount === 1 ? 0.5 : 0,
        `${bestCount} absolute sameAs URLs on the ${typeLabel(bestNode)} node`,
        ['homepage']
      );
    },
  },
  'jsonld.type-breadth': {
    needsHomepage: true,
    run: (context) => {
      const summary = context.homepage.jsonLd;
      if (summary.blocks.length === 0) {
        return notApplicable('no-jsonld', 'no JSON-LD block on the homepage', ['homepage']);
      }
      // Every @type in the parseable blocks, nested objects included.
      const types = new Set<string>(summary.types);
      const extra = [...types].filter((type) => !BASELINE_SET.has(type)).sort();
      return scored(
        extra.length >= 2 ? 1 : extra.length === 1 ? 0.5 : 0,
        extra.length > 0
          ? `${extra.length} types beyond the baseline set: ${extra.slice(0, 8).join(', ')}`
          : `${types.size} types, none beyond the baseline set`,
        ['homepage']
      );
    },
  },
  'jsonld.syntax': {
    needsHomepage: true,
    run: (context) => {
      const summary = context.homepage.jsonLd;
      if (summary.blocks.length === 0) {
        return notApplicable('no-jsonld', 'no script type=application/ld+json on the homepage', ['homepage']);
      }
      const failed = summary.blocks.filter((block) => !block.ok);
      if (failed.length === 0) {
        return scored(1, `${summary.blocks.length} JSON-LD block(s) parse`, ['homepage']);
      }
      const named = failed
        .map((block) => `block ${block.index + 1}${block.position !== null ? ` (parse error at position ${block.position})` : ' (parse error)'}`)
        .join(', ');
      return scored(0, `${failed.length}/${summary.blocks.length} JSON-LD blocks fail to parse: ${named}`, ['homepage']);
    },
  },
  'trust.anchors': {
    needsHomepage: true,
    run: (context) => {
      const found = new Map<AnchorKind, string>();
      for (const anchor of context.homepage.anchors(context.homepageUrl)) {
        const resolved = anchor.resolved;
        if (!resolved || resolved.origin !== context.origin) {
          continue;
        }
        const segments = resolved.pathname.toLowerCase().split('/').filter(Boolean);
        const first = segments[0] ?? '';
        for (const [kind, pattern] of ANCHOR_PATH_RULES) {
          if (!found.has(kind) && pattern.test(first)) {
            found.set(kind, resolved.pathname);
          }
        }
        if (!found.has('privacy') && first === 'legal' && segments[1] === 'privacy') {
          found.set('privacy', resolved.pathname);
        }
        // Published rule: any same-origin link whose text is About, Contact or
        // Privacy counts, including a one-page site's section links (/#contact).
        const text = anchor.text.toLowerCase();
        const target = `${resolved.pathname}${resolved.hash}`;
        for (const [kind, texts] of ANCHOR_TEXT_RULES) {
          if (!found.has(kind) && texts.has(text)) {
            found.set(kind, target);
          }
        }
      }
      const kinds: AnchorKind[] = ['about', 'contact', 'privacy'];
      const parts = kinds.map((kind) => (found.has(kind) ? `${kind} ${found.get(kind)}` : `no ${kind} link`));
      return scored(found.size / 3, `${parts.join('; ')}; same-origin links resolved against ${context.homepageUrl}`, [
        'homepage',
      ]);
    },
  },
};
