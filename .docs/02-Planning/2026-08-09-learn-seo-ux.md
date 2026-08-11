# Learn hub, simpler UX, and SEO protection

Status: implemented and verified locally

## Contract

- Preserve the existing 26 public URLs, canonical URLs, metadata, H1, ordered H2 structure, section IDs, JSON-LD types, internal links, and prerendered content.
- Add one indexable, self-canonical route: `/learn/`.
- Keep the AI Observatory visual direction, all API and worker contracts, MPA prerendering, and both themes.
- Prefer plain language and progressive disclosure without moving authored content between URLs.
- Add no runtime dependency, deploy, commit, PR, redirect, or backend change.

## Execution

1. Freeze and verify the production SEO structure of the 26 existing routes.
2. Update `DESIGN.md` with the structural SEO and learning-path rules.
3. Type editorial audience, topic, and level metadata.
4. Build `/learn/`, its MPA entry, metadata, CollectionPage/ItemList schema, llms.txt entry, and markdown mirror.
5. Add navigation, homepage teaser, guide summaries, blog filters, article metadata, and contextual recommendations.
6. Refine tools, author, and legal surfaces without altering API or authored heading structure.
7. Run unit, type, lint, build, structural SEO, Docker, browser, accessibility, responsive, and performance verification.

## Post-implementation simplification

After visual review, the homepage and article endings received a focused noise-reduction pass without changing the structural SEO contract:

- the three homepage orientation cards became a compact navigation rail;
- the six capability cards became a compact editorial inventory with technical details in native disclosures;
- the checker CTA keeps its plain-language action visible and groups CLI details under a native disclosure;
- the homepage shows three common FAQs first and groups the seven technical FAQs under one native disclosure;
- article endings show one concise next step, keep toolkit/install copy in prerendered HTML, and reveal it on request;
- use-case cards, author attribution, vertical spacing, and repeated CTA surfaces were compacted.

## Verification result

- all workspace tests passed; the website suite reports 119/119;
- typecheck, lint, production build, and `git diff --check` passed;
- the structural verifier passed for 27 routes and confirmed all 26 original routes are preserved;
- Docker/Wrangler was rebuilt and serves the current build on `http://127.0.0.1:8080`;
- targeted desktop/mobile browser verification found no overflow, console errors, or missing prerendered disclosure content;
- keyboard verification passed for the nested FAQ and article toolkit disclosures.

## Definition of done

- 27 routes build and prerender.
- The frozen 26-route structural baseline remains intact.
- `/learn/` is unique, useful, self-canonical, and present in JSON-LD, llms.txt, and markdown output.
- All checks and the approved responsive/accessibility matrix pass, with any residual performance or E2E-state limitation reported explicitly.
