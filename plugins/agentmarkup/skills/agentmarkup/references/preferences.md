# Preference Capture

Ask only for preferences that cannot be discovered from the repo. Use these defaults when the user does not answer and the choice is low risk.

## Required Or High Impact

- `site`: Prefer a production URL from existing config, README, sitemap, canonical tags, deployment config, or package metadata. Ask if multiple plausible public URLs exist.
- `name`: Prefer the product/site name already used in metadata or README.
- `description`: Prefer an existing meta description, README summary, or homepage copy.
- AI crawler policy: Ask when intent is unknown. Default to no crawler rules rather than assuming allow or disallow for all bots.

## Common Defaults

- `llmsTxt`: Enable when the user wants AgentMarkup installed. Include a small first section of important same-site public pages.
- `llmsFullTxt`: Leave disabled unless the user wants a richer agent companion file or the site has useful markdown mirrors to inline.
- `markdownPages`: Enable when raw HTML is thin, noisy, or client-rendered. Treat as optional when HTML is already substantial.
- `contentSignalHeaders`: Ask for policy. If the user wants broad discoverability, use `aiTrain: 'yes'`, `search: 'yes'`, and `aiInput: 'yes'`; otherwise encode their choices exactly.
- `globalSchemas`: Prefer `webSite` and `organization` for a homepage baseline when enough information exists.
- `pages`: Add page-level schemas only for pages whose content supports the schema, such as `article`, `faqPage`, `product`, or `offer`.
- `validation.warnOnMissingSchema`: Enable when the user wants the build to surface missing structured-data coverage.

## Replacement Flags

Only set these after explicit user approval:

- `llmsTxt.replaceExisting`
- `llmsFullTxt.replaceExisting`
- `markdownPages.replaceExisting`
- `contentSignalHeaders.replaceExisting`
- `jsonLd.replaceExistingTypes`
- `agentCard.replaceExisting`

## A2A Agent Card

Enable `agentCard` only when the site already runs a real A2A-compatible agent service. Required details include:

- `version`
- at least one `supportedInterfaces` entry with `url`, `protocolBinding`, and `protocolVersion`
- a non-empty description through top-level `description` or `agentCard.description`
