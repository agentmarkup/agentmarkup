import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentMarkupConfig } from '@agentmarkup/core';
import {
  generateLlmsTxt,
  generateJsonLdTags,
  injectJsonLdTags,
  patchRobotsTxt,
  presetToJsonLd,
  validateLlmsTxt,
  validateRobotsTxt,
} from '@agentmarkup/core';

const site = 'https://example.com';
const outputDir = 'dist';

// Replace undefined only after the user chooses allow/disallow policy.
const crawlerPolicy: AgentMarkupConfig['aiCrawlers'] = undefined;
// const crawlerPolicy: AgentMarkupConfig['aiCrawlers'] = {
//   GPTBot: 'allow',
//   ClaudeBot: 'allow',
//   PerplexityBot: 'allow',
//   'Google-Extended': 'allow',
// };

const config = {
  site,
  name: 'Example',
  description: 'Machine-readable metadata for this site.',
  llmsTxt: {
    sections: [
      {
        title: 'Pages',
        entries: [
          {
            title: 'Home',
            url: '/',
            description: 'Homepage and primary site overview.',
          },
        ],
      },
    ],
  },
  globalSchemas: [
    {
      preset: 'webSite',
      name: 'Example',
      url: site,
    },
  ],
  ...(crawlerPolicy ? { aiCrawlers: crawlerPolicy } : {}),
} satisfies AgentMarkupConfig;

const llmsTxt = generateLlmsTxt(config);
if (llmsTxt) {
  await writeFile(join(outputDir, 'llms.txt'), llmsTxt, 'utf8');
  const issues = validateLlmsTxt(llmsTxt);
  if (issues.some((issue) => issue.severity === 'error')) {
    throw new Error(`Invalid llms.txt: ${issues.map((issue) => issue.message).join('; ')}`);
  }
}

if (crawlerPolicy) {
  const robotsPath = join(outputDir, 'robots.txt');
  let existingRobots = '';
  try {
    existingRobots = await readFile(robotsPath, 'utf8');
  } catch {
    existingRobots = 'User-agent: *\nAllow: /\n';
  }

  const robotsTxt = patchRobotsTxt(existingRobots, crawlerPolicy);
  const robotsIssues = validateRobotsTxt(robotsTxt, crawlerPolicy);
  if (robotsIssues.some((issue) => issue.severity === 'error')) {
    throw new Error(`Invalid robots.txt: ${robotsIssues.map((issue) => issue.message).join('; ')}`);
  }
  await writeFile(robotsPath, robotsTxt, 'utf8');
}

const jsonLdTags = generateJsonLdTags(
  config.globalSchemas.map((schema) => presetToJsonLd(schema))
);
const homepagePath = join(outputDir, 'index.html');
try {
  const homepageHtml = await readFile(homepagePath, 'utf8');
  await writeFile(homepagePath, injectJsonLdTags(homepageHtml, jsonLdTags), 'utf8');
} catch {
  console.warn(`Skipped JSON-LD injection because ${homepagePath} was not readable.`);
}
