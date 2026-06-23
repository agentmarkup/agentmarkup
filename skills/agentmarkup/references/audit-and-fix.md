# Audit And Fix Checklist

Run audits against the surface that matters: source config, built output, and deployed site when a public URL is available.

## Homepage HTML

Check:

- reachable HTML response
- meaningful raw body content, not only a thin client shell
- canonical URL
- meta description
- `<html lang>`
- meaningful H1
- `llms.txt` discovery link
- JSON-LD presence and validity

Fix with AgentMarkup when possible: discovery link, JSON-LD, markdown alternate links. Fix directly in the app when the issue is canonical URL, description, language, H1, noindex, or thin final HTML.

## `llms.txt`

Check:

- file exists when configured
- useful same-site coverage
- deterministic sections and valid entries
- homepage discovery link points to it
- same-site entries prefer markdown mirrors when markdown generation is enabled
- external URLs and non-HTML file URLs remain unchanged

Fix by adjusting `llmsTxt.sections`, `llmsTxt.instructions`, or markdown mirror preference. Preserve an existing curated file unless replacement was explicitly approved.

## `llms-full.txt`

Only audit when enabled.

Check:

- file exists
- same-site content is inlined from final markdown or final HTML strategy
- entries align with the chosen fetch path

Fix by enabling markdown mirrors where useful, correcting `llmsTxt.sections`, or disabling `llmsFullTxt` if the project does not need the richer companion file.

## JSON-LD

Check:

- valid `application/ld+json` blocks
- homepage baseline `WebSite` and `Organization` when information is available
- page-level schema matches actual content
- duplicate schema types are preserved unless replacement was requested

Fix with `globalSchemas`, `pages`, and presets. Use custom schema objects only when presets are insufficient.

## `robots.txt`

Check:

- explicit AI crawler directives where intended
- marker-managed AgentMarkup section remains intact and idempotent
- broad `User-agent: *` rules do not contradict intended AI crawler access
- sitemap declaration is present and sane

Fix with `aiCrawlers` for AI bot rules. Fix sitemap generation outside AgentMarkup if the project lacks a sitemap.

## `_headers` And Hosting Headers

Check:

- `Content-Signal` exists when enabled
- canonical `Link` headers exist for markdown mirrors
- existing non-AgentMarkup rules are preserved
- deployed hosting actually serves the headers

Fix with `contentSignalHeaders` and markdown mirror settings when the adapter owns output headers. Fix hosting config directly if the platform ignores `_headers`.

## Markdown Mirrors

Recommend mirrors when raw HTML is thin, noisy, or client-rendered. Treat mirrors as optional when raw HTML is already useful.

Check:

- generated `.md` files are directly fetchable
- HTML pages advertise markdown alternates
- markdown mirrors have canonical headers back to HTML
- `llms.txt` entries point to mirrors when that preference is enabled

Do not claim markdown mirrors solve missing final HTML for search engines or users; they provide a cleaner agent fetch path.
