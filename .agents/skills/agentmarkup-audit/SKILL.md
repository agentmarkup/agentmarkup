---
name: agentmarkup-audit
description: Audit and improve machine-readable website metadata with agentmarkup. Use when the user wants to determine final-output ownership, choose @agentmarkup/vite vs @agentmarkup/astro vs @agentmarkup/core, or audit llms.txt, llms-full.txt, JSON-LD, robots.txt, _headers, markdown mirrors, or the website checker.
---

# agentmarkup Audit

Use this skill for audit and recommendation work around agentmarkup.

## When to use it

- Audit a repo, build output, or deployed site for machine-readable metadata.
- Decide whether `@agentmarkup/vite`, `@agentmarkup/astro`, or `@agentmarkup/core` is the right integration point.
- Check whether markdown mirrors are appropriate or unnecessary.
- Compare a site or repo against the same expectations used by the website checker.

## Scope

This skill is for audit and recommendation work first.

- Read existing config, built output, and emitted metadata before proposing changes.
- Keep repo-local skill work separate from package or website runtime changes unless the user explicitly asks for implementation work there.
- Use the website checker as a reference for deployed-site expectations, not as the only source of truth.

## Workflow

1. Identify the audit surface:
   - source repo
   - built output
   - deployed public site
2. Determine final-output ownership. Read [references/adapter-selection.md](references/adapter-selection.md).
3. Run the audit. Read [references/audit-checklist.md](references/audit-checklist.md).
4. Report in this order:
   - who owns final HTML
   - adapter recommendation
   - findings by severity
   - concrete next changes
5. If the user wants implementation, change only the necessary files. Do not couple the skill itself to runtime package behavior unless asked.

## Repo hints

When auditing this repository itself:

- `packages/core` contains the shared generators and validation helpers.
- `packages/vite` and `packages/astro` are thin adapters on top of core.
- `website/` dogfoods the packages and contains the public website checker.
- `website/src/checker/analyze.ts` is the clearest expression of the checker findings and expected end-state behavior.
- `website/public/_worker.js` shows the checker fetch scope, normalization rules, and protection limits for deployed-site audits.

## Output expectations

Prefer concise findings with explicit file or output references. Call out:

- what owns final HTML
- whether agentmarkup belongs in build hooks or a later final-output step
- which artifacts exist, are missing, or conflict
- whether markdown mirrors are warranted, optional, or a distraction

Only recommend markdown mirrors when the raw HTML is thin, noisy, client-rendered, or otherwise a poor fetch target. Do not frame markdown mirrors as required when the raw HTML is already substantial.
