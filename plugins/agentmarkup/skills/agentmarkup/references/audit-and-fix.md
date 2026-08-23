# Audit And Fix Checklist

Run audits against the surface that matters: source config, built output, and deployed site when a public URL is available.

## Which Tool, And What It Is Allowed To Claim

Three different things audit, and they are not interchangeable:

| Tool | What it does | Uses crawler user agents? |
|---|---|---|
| `agentmarkup check <outDir>` (`@agentmarkup/cli`) | Validates files already on disk. Never writes. The CI gate. | No, it is local |
| `@agentmarkup/audit <url>` | Fetches a live origin as a browser and as several AI crawler user agents, then diffs | Yes |
| The agentmarkup.dev website checker | Fetches a public site and reports what a plain request sees | **No.** It identifies itself honestly |

Rules that hold for all three:

- Only run a live audit against an origin the user owns or operates, and only after they approved it.
- A 403 or a block against a spoofed crawler user agent is a **warning to investigate**, never proof that a site "blocks AI". WAF rules, bot management, and IP reputation produce the same response.
- Report deterministic pass / warn / error findings. There is no score, grade, or percentage, and inventing one misrepresents what the tool measured.
- Missing markdown mirrors are only a real finding when the paired HTML is genuinely thin. If the HTML is substantial, mirrors are optional extra coverage. If the paired HTML fetch failed or was rate limited, that is an unknown state, not evidence the HTML is fine.

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
- links use Markdown syntax `- [Label](https://example.com)`, not plain-text `- Label: https://example.com` lines
- homepage discovery link points to it
- same-site entries prefer markdown mirrors when markdown generation is enabled
- external URLs and non-HTML file URLs remain unchanged

Fix by adjusting `llmsTxt.sections`, `llmsTxt.instructions`, or markdown mirror preference. Preserve an existing curated file unless replacement was explicitly approved. If a curated file uses bare-URL list lines, convert them to Markdown links in place (content-preserving) rather than regenerating; bare URLs are flagged by the build validator and the website checker because the llmstxt.org spec and Google Lighthouse only recognize Markdown links.

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
