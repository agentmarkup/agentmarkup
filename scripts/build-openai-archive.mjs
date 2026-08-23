#!/usr/bin/env node
// Build the ZIP that OpenAI's plugin portal accepts, from plugins/agentmarkup.
//
//   node scripts/build-openai-archive.mjs [outfile]
//
// Why this exists rather than zipping the plugin directory directly: the two directories
// disagree about one field. OpenAI's uploader REQUIRES `interface.shortDescription` in
// `.claude-plugin/plugin.json` (240 chars max) and blocks the upload without it. Claude's
// `plugin validate --strict` REJECTS the same field: "Unknown field 'interface'. Claude Code
// ignores it at load time." Harmless at runtime, but it fails a strict validate.
//
// So the committed manifest stays Claude-clean and the field is injected here, into the
// archive only. Everything else in the archive is a byte-for-byte copy of the plugin.

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = join(repoRoot, 'plugins', 'agentmarkup');

// The full `interface` block OpenAI's portal reads. Baking it into the archive means the
// draft arrives prefilled instead of being retyped into the form. Field names come from the
// manifest example in developers.openai.com/plugins/build/plugins.md.
//
// `shortDescription` has a documented 240-character maximum. `composerIcon` and `logo` must
// both reference SQUARE images, relative to the plugin root.
const INTERFACE = {
  displayName: 'AgentMarkup',
  shortDescription:
    'Generate llms.txt, JSON-LD, markdown mirrors and AI-crawler rules for a JavaScript web repo at build time, then validate the built output. Asks before changing anything.',
  longDescription:
    'agentmarkup generates the machine-readable layer of a website at build time: llms.txt, JSON-LD structured data, markdown mirrors, AI-crawler robots.txt rules and Content-Signal headers, then validates what the build actually produced. ' +
    'It works out which layer owns your final HTML and installs the matching adapter rather than guessing from what is already in package.json: Vite, Astro, Next or Nuxt, plus a framework-agnostic CLI for any other directory of built HTML, and core helpers for custom pipelines and dynamic SSR routes. ' +
    'Inspecting your repo is read-only. Before installing a package, writing config, running a build, or making an outbound request to a deployed site, it stops and presents a single plan naming the package, every file that would change, and the exact commands. ' +
    'Validation is deterministic: a missing required field is an error, a missing recommended field is a warning. There is no score, grade or percentage. Existing curated llms.txt, robots.txt, _headers and JSON-LD are preserved unless you explicitly opt into replacement. ' +
    'Open source and MIT licensed.',
  developerName: 'Anima Felix',
  category: 'Developer Tools',
  capabilities: ['Read', 'Write'],
  websiteURL: 'https://agentmarkup.dev',
  privacyPolicyURL: 'https://agentmarkup.dev/privacy/',
  termsOfServiceURL: 'https://agentmarkup.dev/terms/',
  // The portal accepts at most three.
  defaultPrompt: [
    'Set up llms.txt and JSON-LD for this site so AI agents can read it.',
    'Agents only see an empty div on my site. What should I do?',
    'Add a CI gate so our machine-readable output cannot silently break.',
  ],
  brandColor: '#4f7cff',
  composerIcon: './assets/icon.png',
  logo: './assets/logo.png',
};

// Square source images, injected into the archive rather than committed to the plugin: they
// are dead weight for the Claude listing, which never reads them.
const ICON_SOURCES = { 'assets/icon.png': 'icon.png', 'assets/logo.png': 'logo.png' };
const ICON_DIR = join(repoRoot, 'assets', 'plugin');

const outFile = resolve(process.argv[2] ?? join(repoRoot, 'agentmarkup-plugin-openai.zip'));

if (!existsSync(pluginDir)) throw new Error(`Plugin not found at ${pluginDir}`);
if (INTERFACE.shortDescription.length > 240) {
  throw new Error(`interface.shortDescription is ${INTERFACE.shortDescription.length} chars; the limit is 240.`);
}
const CATEGORIES = ['Productivity', 'Creativity', 'Developer Tools', 'Business & Operations',
  'Data & Analytics', 'Communication', 'Education & Research', 'Security', 'Finance',
  'Healthcare', 'Travel', 'Entertainment', 'Other'];
if (!CATEGORIES.includes(INTERFACE.category)) {
  throw new Error(`interface.category must be one of: ${CATEGORIES.join(', ')}`);
}
if (INTERFACE.defaultPrompt.length > 3) {
  throw new Error(`interface.defaultPrompt has ${INTERFACE.defaultPrompt.length} entries; the portal accepts at most 3.`);
}
for (const src of Object.values(ICON_SOURCES)) {
  const p = join(ICON_DIR, src);
  if (!existsSync(p)) throw new Error(`Missing required square image: ${p}`);
}

const staging = mkdtempSync(join(tmpdir(), 'am-openai-'));
try {
  const root = join(staging, 'plugin');
  cpSync(pluginDir, root, { recursive: true, dereference: true });

  // Drop OS junk so it never reaches the archive.
  for (const junk of ['.DS_Store', 'Thumbs.db']) {
    execFileSync('find', [root, '-name', junk, '-delete']);
  }

  mkdirSync(join(root, 'assets'), { recursive: true });
  for (const [dest, src] of Object.entries(ICON_SOURCES)) {
    cpSync(join(ICON_DIR, src), join(root, dest));
  }

  const manifestPath = join(root, '.claude-plugin', 'plugin.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.interface = { ...(manifest.interface ?? {}), ...INTERFACE };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  rmSync(outFile, { force: true });
  execFileSync('zip', ['-qr', outFile, '.'], { cwd: root });

  const listed = execFileSync('unzip', ['-l', outFile], { encoding: 'utf8' });
  for (const required of ['.claude-plugin/plugin.json', 'skills/agentmarkup/SKILL.md', 'assets/icon.png', 'assets/logo.png']) {
    if (!listed.includes(required)) throw new Error(`Archive is missing ${required}`);
  }
  console.log(`Wrote ${outFile}`);
  console.log(`interface.shortDescription: ${INTERFACE.shortDescription.length} chars`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
