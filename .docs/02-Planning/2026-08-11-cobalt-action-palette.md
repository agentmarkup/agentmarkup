# Cobalt action palette — implemented

Date: 2026-08-11
Status: implemented and locally verified

## Decision

All 27 public routes use one cobalt–ultramarine–ice interaction family. Purple and pink action effects are retired. Green, orange, and red remain reserved for semantic success, warning, and error states.

### Action tokens

- Light: `#1D4ED8 → #153EAF`; hover `#2457D6 → #173EA9`
- Dark: `#315FDE → #1D4ED8`; hover `#3A63D4 → #2457D6`
- Decorative rim: `#8FB0FF`
- Action text: white

## Implementation

- Added shared action tokens for light and dark themes.
- Rebuilt primary actions as CSS-only cobalt gradients with a restrained ice rim and neutral shadow.
- Removed the sitewide `SpecularButtons` WebGL treatment and its runtime mount.
- Recolored interactive card edges and glass accents from purple to cobalt/ice.
- Recolored Learning Center Web Threads from purple/pink to cobalt/ice and reduced their intensity behind copy.
- Kept Learning animation desktop-only; reduced-motion and small-screen fallbacks remain static/quiet.
- Normalized navbar, mobile drawer, footer, reading progress, forms, article navigation, and cookie consent through the shared tokens.
- Fixed the homepage FAQ action layout at 320 px to prevent horizontal overflow.
- Did not change copy, headings, route structure, canonicals, application data, APIs, or intended SEO semantics as part of this recolor.

## Route coverage

The common system covers every route in `website/CONTENT_MANIFEST.json`:

1. `/`
2. `/checker/`
3. `/security-scan/`
4. `/learn/`
5. `/docs/llms-txt/`
6. `/docs/json-ld/`
7. `/docs/ai-crawlers/`
8. `/docs/audit/`
9. `/blog/`
10. `/blog/why-llms-txt-matters/`
11. `/blog/what-is-geo/`
12. `/blog/json-ld-structured-data-guide/`
13. `/blog/ai-crawlers-2026/`
14. `/blog/ecommerce-llm-optimization/`
15. `/blog/brand-awareness-ai/`
16. `/blog/markdown-mirrors/`
17. `/blog/website-checker/`
18. `/blog/when-markdown-mirrors-help/`
19. `/blog/nextjs-llms-txt-json-ld/`
20. `/blog/nuxt-llms-txt-json-ld/`
21. `/blog/agentmarkup-cli-any-static-site/`
22. `/blog/audit-ai-crawler-access/`
23. `/blog/ai-crawler-audit-500-companies/`
24. `/authors/sebastian-cochinescu/`
25. `/license/`
26. `/terms/`
27. `/privacy/`

## Verification record

- `pnpm test`: passed, 122 tests.
- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed; 27 HTML pages, 27 JSON-LD injections, and 27 Markdown pages generated.
- Browser sweep at 390×844: 54/54 route-theme combinations passed with no runtime errors or horizontal overflow.
- Browser sweep at 1280×900: 54/54 route-theme combinations passed with no runtime errors or horizontal overflow.
- Browser sweep at 320×844: 54/54 route-theme combinations passed with no horizontal overflow.
- Reduced motion: Learning Center canvas is not mounted.
- Forced colors: active and keyboard focus remain browser-visible.
- White-on-action contrast: minimum 5.36:1 across the approved default and hover endpoints.
- Contract test rejects the retired violet/pink shader and glass values and confirms both cobalt theme ramps.

## Known unrelated baseline issue

`pnpm verify:seo` still reports the existing baseline mismatch on the 14 blog articles (`h2 structure changed` and homepage internal link removed). The recolor did not edit those article structures or regenerate the SEO baseline, so this was left untouched for a separate content/SEO decision.
