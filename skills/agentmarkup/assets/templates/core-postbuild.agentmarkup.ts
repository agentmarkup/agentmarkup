import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  generateLlmsTxt,
  generateJsonLdTags,
  patchRobotsTxt,
  presetToJsonLd,
  validateLlmsTxt,
  validateRobotsTxt,
} from '@agentmarkup/core';

const site = 'https://example.com';
const outputDir = 'dist';

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
  aiCrawlers: {
    GPTBot: 'allow',
    ClaudeBot: 'allow',
    PerplexityBot: 'allow',
    'Google-Extended': 'allow',
  },
} as const;

const llmsTxt = generateLlmsTxt(config);
if (llmsTxt) {
  await writeFile(join(outputDir, 'llms.txt'), llmsTxt, 'utf8');
  const issues = validateLlmsTxt(llmsTxt);
  if (issues.some((issue) => issue.severity === 'error')) {
    throw new Error(`Invalid llms.txt: ${issues.map((issue) => issue.message).join('; ')}`);
  }
}

const robotsPath = join(outputDir, 'robots.txt');
let existingRobots = '';
try {
  existingRobots = await readFile(robotsPath, 'utf8');
} catch {
  existingRobots = 'User-agent: *\nAllow: /\n';
}

const robotsTxt = patchRobotsTxt(existingRobots, config.aiCrawlers);
const robotsIssues = validateRobotsTxt(robotsTxt, config.aiCrawlers);
if (robotsIssues.some((issue) => issue.severity === 'error')) {
  throw new Error(`Invalid robots.txt: ${robotsIssues.map((issue) => issue.message).join('; ')}`);
}
await writeFile(robotsPath, robotsTxt, 'utf8');

const jsonLdTags = generateJsonLdTags(
  config.globalSchemas.map((schema) => presetToJsonLd(schema))
);
console.log(`Generated ${jsonLdTags.length} bytes of JSON-LD tags to inject into final HTML.`);
