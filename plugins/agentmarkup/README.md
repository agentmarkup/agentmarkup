# AgentMarkup plugin for Claude Code

Set up [AgentMarkup](https://agentmarkup.dev) in a JavaScript or TypeScript web repo: generate `llms.txt`, JSON-LD, markdown mirrors, AI-crawler `robots.txt` rules and Content-Signal headers at build time, then validate what the build actually produced.

The plugin works out which layer owns your final HTML and installs the matching package, rather than guessing from what is already in `package.json`.

| Your build | Package |
| --- | --- |
| Vite writes the deployed HTML | `@agentmarkup/vite` |
| Astro static build | `@agentmarkup/astro` |
| Next static export or prerendered pages | `@agentmarkup/next` |
| Nuxt prerender or `nuxt generate` | `@agentmarkup/nuxt` |
| Any other directory of built HTML | `@agentmarkup/cli` |
| A custom post-build script | `@agentmarkup/core` |

## Install

```text
/plugin marketplace add agentmarkup/agentmarkup
/plugin install agentmarkup@agentmarkup
```

Then, in the repo you want to set up, just say what you want, for example "set up llms.txt and JSON-LD for this site". The skill is model-invoked, so there is no command to remember.

## It asks before it changes anything

Inspecting your repo is read-only and happens without prompting. Everything else stops for approval first, as a single plan: the package to install, the files that would change, the commands to run, and the URL of any live audit. Approval covers that plan, not the rest of the session.

If you deploy and want to check the live site, `@agentmarkup/audit` fetches it under AI-crawler user agents and diffs against a normal browser request. Only point it at a site you own or operate.

## What it will not do

- Invent a readiness score, letter grade, or percentage. Validation is deterministic: a missing required field is an error, a missing recommended field is a warning, and that is the whole scale.
- Claim a site "blocks AI" because a crawler user agent got a 403. WAF and bot-management rules produce the same response, so that is reported as something to investigate.
- Overwrite a curated `llms.txt`, `robots.txt`, `_headers`, or existing JSON-LD. Existing work is preserved unless you explicitly opt into replacement.
- Present markdown mirrors as mandatory. They help when HTML is thin, noisy, or client-rendered, and are optional when it is not.

## Requirements

A repo you can install packages into and build. On surfaces with no shell or checkout, such as a plain chat, the skill still helps you choose an adapter and drafts the config, but you run the install and build yourself.

## Links

- [agentmarkup.dev](https://agentmarkup.dev)
- [github.com/agentmarkup/agentmarkup](https://github.com/agentmarkup/agentmarkup)

MIT licensed. Maintained by Sebastian Cochinescu and Anima Felix.
