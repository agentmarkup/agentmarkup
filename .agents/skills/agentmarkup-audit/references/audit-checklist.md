# Audit Checklist

Run the audit in this order.

## 1. Identify the target

- source repo only
- built output such as `dist/`
- deployed public site

Make it explicit which surface you are auditing before drawing conclusions.

## 2. Audit homepage HTML

Check for:

- reachable public HTML
- meaningful raw body content, not just a thin client shell
- canonical URL
- meta description
- `<html lang>`
- a meaningful H1
- homepage `llms.txt` discovery link
- JSON-LD presence and validity

## 3. Audit `llms.txt`

Check for:

- file exists
- deterministic structure and valid entries
- useful same-site coverage
- homepage discovery link points to it
- same-site page entries prefer markdown mirrors when markdown generation is enabled
- external URLs and non-HTML file URLs stay unchanged

## 4. Audit `llms-full.txt`

Only audit this when the project enables it.

Check for:

- file exists when expected
- same-site content is inlined from final markdown or final HTML strategy, not an earlier shell
- entries stay aligned with the chosen fetch path

## 5. Audit JSON-LD

Check for:

- valid `application/ld+json` blocks
- homepage baseline types such as `WebSite` and `Organization`
- duplicate schema types are preserved unless replacement was explicitly requested

## 6. Audit `robots.txt`

Check for:

- explicit AI crawler directives where intended
- marker-managed blocks stay intact and idempotent
- sitemap declaration is present and sane

## 7. Audit `_headers`

Check for:

- `Content-Signal` when enabled
- canonical `Link` headers for markdown mirrors when mirrors exist
- existing non-agentmarkup rules are preserved
- existing marker-managed blocks are not dropped

## 8. Decide whether markdown mirrors are appropriate

Recommend markdown mirrors when:

- raw HTML is thin
- the page is noisy or client-rendered
- a cleaner fetch path would materially help agents

Treat markdown mirrors as optional when:

- raw HTML is already substantial
- the main problem is not fetch cleanliness

Do not present markdown mirrors as a substitute for prerender or other final-HTML work.

## 9. Use the website checker where it helps

Inside this repo, the website checker is a good reference for deployed-site expectations.

It covers:

- homepage reachability
- thin HTML
- markdown alternate discovery
- `llms.txt`
- `robots.txt`
- sitemap discovery
- one same-origin sample page plus its markdown mirror

Relevant implementation references:

- `website/src/checker/analyze.ts`
- `website/public/_worker.js`

Use the checker logic to align recommendations with the public product story, but do not edit the checker unless the user asked for checker work specifically.
