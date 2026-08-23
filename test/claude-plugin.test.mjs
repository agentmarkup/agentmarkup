// Shape and drift checks for the Claude plugin at plugins/agentmarkup/.
//
// Plain .mjs on purpose: .node-version pins 22.16.0 and unflagged TypeScript type-stripping only
// arrived in 22.18.0, so a .ts test would fail for anyone whose version manager honours that file
// while CI (node-version: 22, floating) stayed green.
//
// This suite never writes inside the repository. The sync script is only ever called with --check.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { diffSkill, isIgnored, listFiles, sync, SymlinkInSkillError, SOURCE, DEST } from '../scripts/sync-plugin-skill.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = join(repoRoot, 'plugins', 'agentmarkup');
const readJson = (p) => JSON.parse(readFileSync(join(repoRoot, p), 'utf8'));
const readText = (p) => readFileSync(join(repoRoot, p), 'utf8');

// Reserved by Anthropic; a marketplace using one is blocked at load time.
const RESERVED_MARKETPLACE_NAMES = [
  'claude-plugins-official',
  'claude-community',
  'claude-plugins-community',
  'knowledge-work-plugins',
  'life-sciences',
  'claude-for-legal',
  'financial-services-plugins',
  'anthropic-plugins',
];

test('marketplace.json points only at the plugin subdirectory', () => {
  const m = readJson('.claude-plugin/marketplace.json');
  assert.equal(m.name, 'agentmarkup');
  assert.ok(m.description, 'marketplace needs a top-level description or --strict fails');
  assert.equal(m.owner.email, 'hello@animafelix.com');
  assert.equal(m.plugins.length, 1);
  assert.equal(m.plugins[0].source, './plugins/agentmarkup');
  assert.ok(!RESERVED_MARKETPLACE_NAMES.includes(m.name));
});

test('plugin.json carries the fields the validator requires', () => {
  const p = readJson('plugins/agentmarkup/.claude-plugin/plugin.json');
  for (const field of ['name', 'description', 'version', 'author', 'homepage', 'repository']) {
    assert.ok(p[field], `plugin.json is missing ${field}`);
  }
  assert.equal(p.name, 'agentmarkup');
  assert.equal(p.license, 'MIT');
  // Verified against `claude plugin validate`: a string author is rejected outright.
  assert.equal(typeof p.author, 'object', 'author must be an object, not an npm-style string');
});

test('plugin author matches the published package identity', () => {
  const p = readJson('plugins/agentmarkup/.claude-plugin/plugin.json');
  const core = readJson('packages/core/package.json');
  // packages/core currently uses the npm string form "Name <email> (url)", but npm also allows
  // an object. Normalize so a future change there fails this assertion instead of throwing.
  const coreAuthor =
    typeof core.author === 'string'
      ? core.author
      : `${core.author.name} <${core.author.email}> (${core.author.url})`;
  assert.ok(coreAuthor.includes(p.author.name), 'author name drifted from packages/core');
  assert.ok(coreAuthor.includes(p.author.email), 'author email drifted from packages/core');
});

test('marketplace entry resolves to a real plugin with a matching name', () => {
  const m = readJson('.claude-plugin/marketplace.json');
  const entry = m.plugins[0];
  const manifestPath = join(repoRoot, entry.source, '.claude-plugin', 'plugin.json');
  assert.ok(existsSync(manifestPath), `marketplace source ${entry.source} has no plugin.json`);
  assert.equal(JSON.parse(readFileSync(manifestPath, 'utf8')).name, entry.name,
    'plugin.json name and marketplace entry name disagree');
});

test('README install snippet matches the manifest names', () => {
  const m = readJson('.claude-plugin/marketplace.json');
  const p = readJson('plugins/agentmarkup/.claude-plugin/plugin.json');
  const readme = readText('plugins/agentmarkup/README.md');
  // Pins the documented command to the real names so a rename cannot silently break it.
  assert.ok(readme.includes(`/plugin install ${p.name}@${m.name}`),
    `README does not document "/plugin install ${p.name}@${m.name}"`);
});

test('plugin ships its own README and LICENSE', () => {
  assert.ok(existsSync(join(pluginRoot, 'README.md')));
  assert.equal(
    readText('plugins/agentmarkup/LICENSE'),
    readText('LICENSE'),
    'plugin LICENSE should be a copy of the repo LICENSE'
  );
});

test('skill is present in the plugin and is a real directory, not a symlink', () => {
  assert.ok(existsSync(join(DEST, 'SKILL.md')));
  // `claude plugin validate` does not follow symlinks and --strict fails on the warning it emits.
  assert.ok(!lstatSync(DEST).isSymbolicLink(), 'plugin skill must be a real copy');
});

test('plugin skill copy has not drifted from the canonical skill', () => {
  const { missing, extra, changed } = diffSkill();
  assert.deepEqual({ missing, extra, changed }, { missing: [], extra: [], changed: [] },
    'run `pnpm sync:plugin`');
});

test('sync --check agrees, and writes nothing', () => {
  const before = listFiles(DEST);
  execFileSync(process.execPath, [join(repoRoot, 'scripts/sync-plugin-skill.mjs'), '--check'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
  assert.deepEqual(listFiles(DEST), before);
});

test('a symlink inside the skill tree is a hard error, not a silent skip', () => {
  // Dirent reflects lstat, so a symlink is neither isFile() nor isDirectory(). Skipping it
  // would drop the file from the plugin copy AND from the comparison, leaving --check happy.
  const tmp = mkdtempSync(join(tmpdir(), 'am-symlink-'));
  try {
    writeFileSync(join(tmp, 'real.md'), 'real');
    symlinkSync('real.md', join(tmp, 'link.md'));
    assert.throws(() => listFiles(tmp), SymlinkInSkillError);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('sync write path copies the tree, on a temp fixture', () => {
  // Exercises sync() itself rather than only --check, without writing inside the repository.
  const tmp = mkdtempSync(join(tmpdir(), 'am-sync-'));
  try {
    const src = join(tmp, 'src');
    const dst = join(tmp, 'dst');
    mkdirSync(join(src, 'references'), { recursive: true });
    writeFileSync(join(src, 'SKILL.md'), 'skill body');
    writeFileSync(join(src, 'references', 'a.md'), 'reference body');
    writeFileSync(join(src, '.DS_Store'), 'junk');

    assert.equal(sync(src, dst), 2);
    assert.deepEqual(listFiles(dst), ['SKILL.md', 'references/a.md']);
    assert.equal(readFileSync(join(dst, 'references', 'a.md'), 'utf8'), 'reference body');
    assert.ok(!existsSync(join(dst, '.DS_Store')), 'ignored junk must not be copied');
    assert.deepEqual(diffSkill(src, dst), { missing: [], extra: [], changed: [] });

    // A stale file on the destination side is removed, not left behind.
    writeFileSync(join(dst, 'stale.md'), 'stale');
    sync(src, dst);
    assert.ok(!existsSync(join(dst, 'stale.md')));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('ignore list is narrow, not "every dotfile"', () => {
  assert.ok(isIgnored('.DS_Store'));
  assert.ok(isIgnored('._foo'));
  // A meaningful dotfile added to the skill later must surface as drift, not vanish silently.
  assert.ok(!isIgnored('.keep'));
  assert.ok(!isIgnored('SKILL.md'));
});

test('skill documents every shipped package', () => {
  for (const file of [join(SOURCE, 'SKILL.md'), join(DEST, 'SKILL.md')]) {
    const text = readFileSync(file, 'utf8');
    for (const pkg of ['vite', 'astro', 'next', 'nuxt', 'cli', 'audit', 'core']) {
      assert.ok(text.includes(`@agentmarkup/${pkg}`), `${file} never mentions @agentmarkup/${pkg}`);
    }
  }
});

test('approval gate covers install, config writes, builds, and the audit fetch', () => {
  for (const file of [join(SOURCE, 'SKILL.md'), join(DEST, 'SKILL.md')]) {
    const text = readFileSync(file, 'utf8');
    assert.match(text, /explicit approval before changing anything/i);
    assert.match(text, /one plan, asked once/i);
    assert.match(text, /do not proceed on silence/i);
    for (const action of [/installing a package/i, /writing or patching config/i, /running a build/i, /outbound audit request/i]) {
      assert.match(text, action, `${file} does not name this action in the gate`);
    }
    // The origin-ownership question is the control that keeps audit from being a UA-spoofing probe.
    assert.match(text, /own or operate/i);
    // Re-approval must not be narrowed to installs and builds.
    assert.match(text, /beyond the plan approved/i);
    // The pre-gate defect: an unguarded numbered install step.
    assert.doesNotMatch(text, /^4\. Install the selected package/m);
  }
});

test('skill states what it cannot do without a shell', () => {
  for (const file of [join(SOURCE, 'SKILL.md'), join(DEST, 'SKILL.md')]) {
    const text = readFileSync(file, 'utf8');
    assert.match(text, /without a shell or a repository/i);
    assert.match(text, /do not narrate an installation you cannot perform/i);
  }
});

test('public copy promises no ranking, traffic, or score', () => {
  // Deliberately matches PROMISES, not vocabulary: honest copy has to be able to say
  // "we do not invent a readiness score", and an earlier version of this test failed on
  // exactly that disclaimer.
  const surfaces = [
    readFileSync(join(SOURCE, 'SKILL.md'), 'utf8'),
    readText('plugins/agentmarkup/README.md'),
    readJson('plugins/agentmarkup/.claude-plugin/plugin.json').description,
  ];
  const promises = [
    /\brank (?:higher|better)\b/i,
    /\bimprove your (?:ranking|visibility|traffic)\b/i,
    /\bguarantee(?:s|d)?\b/i,
    /\bget (?:cited|indexed|recommended) by\b/i,
    /\byour (?:readiness|visibility|AI) score\b/i,
    /\bscores? your\b/i,
  ];
  for (const text of surfaces) {
    for (const promise of promises) assert.doesNotMatch(text, promise);
  }
});

test('public copy states the honesty position outright', () => {
  const readme = readText('plugins/agentmarkup/README.md');
  assert.match(readme, /deterministic/i);
  assert.match(readme, /error/i);
  assert.match(readme, /warning/i);
  assert.match(readme, /own or operate/i);
});

test('no claim of an official Anthropic listing', () => {
  const readme = readText('plugins/agentmarkup/README.md');
  assert.doesNotMatch(readme, /official (anthropic )?(plugin )?directory|anthropic verified/i);
});

test('.mjs template parses', () => {
  execFileSync(process.execPath, ['--check', join(SOURCE, 'assets/templates/agentmarkup.config.mjs')], {
    stdio: 'pipe',
  });
});

test('.ts templates pass a structural smoke check (not a parse)', () => {
  // Deliberately not called a parse: invalid TypeScript can satisfy this. The templates are
  // documentation patterns reviewed by eye.
  const dir = join(SOURCE, 'assets/templates');
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const text = readFileSync(join(dir, name), 'utf8');
    const code = text.replace(/^\s*\/\/.*$/gm, '');
    assert.equal(
      (code.match(/{/g) || []).length,
      (code.match(/}/g) || []).length,
      `${name} has unbalanced braces`
    );
    if (name.startsWith('nuxt.')) assert.match(text, /defineNuxtConfig/);
    else assert.match(text, /agentmarkup|@agentmarkup\//);
  }
});

test('nuxt and cli templates use the real APIs, not a plugin-style call', () => {
  const nuxt = readFileSync(join(SOURCE, 'assets/templates/nuxt.config.agentmarkup.ts'), 'utf8');
  assert.match(nuxt, /modules:\s*\[['"]@agentmarkup\/nuxt['"]\]/);
  assert.match(nuxt, /agentmarkup:\s*{/, 'nuxt config is a key, not agentmarkup(...)');

  const cli = readFileSync(join(SOURCE, 'assets/templates/agentmarkup.config.mjs'), 'utf8');
  assert.match(cli, /export default\s*{/, 'cli config is a plain exported object');
  assert.doesNotMatch(cli, /defineConfig|agentmarkup\(/);
});

test('plugin ships no excluded surface', () => {
  const forbidden = ['.mcp.json', '.lsp.json', 'hooks.json', 'settings.json', '_worker.js'];
  for (const file of listFiles(pluginRoot)) {
    const base = file.split('/').pop();
    assert.ok(!forbidden.includes(base), `plugin must not ship ${file}`);
    assert.ok(!file.startsWith('website/'), `plugin must not ship ${file}`);
    assert.ok(!file.startsWith('packages/'), `plugin must not ship ${file}`);
  }
  for (const dir of ['hooks', 'monitors', 'bin', 'commands']) {
    assert.ok(!existsSync(join(pluginRoot, dir)), `plugin must not ship ${dir}/`);
  }
});

test('no sub-agent is loadable from the plugin', () => {
  // Cheap insurance only. Verified on Claude Code 2.1.238 that agents/openai.yaml loads as
  // nothing (`Agents (0)`), because sub-agents are agents/*.md. The skills.sh interface file
  // rides along in the skill copy and is inert.
  const agentMarkdown = listFiles(pluginRoot).filter((f) => /(^|\/)agents\/.*\.md$/.test(f));
  assert.deepEqual(agentMarkdown, []);
});
