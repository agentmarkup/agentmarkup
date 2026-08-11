# Sitewide reading shield

Date: 2026-08-11
Status: implemented and verified

## Goal

Keep the Molten Metal background visible without allowing its bright filaments to reduce text, table, chart, form, or navigation readability on any public route.

## Implementation

- Added a theme-aware `--reading-shield` token for light and dark modes.
- Applied one continuous shield to the shared `.page-shell`, at full strength behind content and fading only through the outer page gutters.
- Preserved the existing shader, responsive layout, content, route structure, and SEO semantics.
- Added solid fallbacks for print and forced-colors modes.
- Documented the protected reading-zone contract in `website/DESIGN.md`.
- Added UI contract assertions for both theme tokens and the page-shell gradient stop.
- Recorded the approved current 27-route editorial structure as a new SEO snapshot and excluded `/learn/` from its own cross-page paragraph-duplication comparison. This verifies future drift from the approved snapshot; it is not evidence that the previous snapshot was unchanged.

## Verification

- Production build: pass; 27 HTML pages, 27 JSON-LD injections, and 27 Markdown mirrors.
- Unit/UI contract tests: 122/122 pass.
- Lint, TypeScript, and `git diff --check`: pass.
- SEO structure verification: 27/27 routes pass.
- Production browser sweep: 27 routes at 390x844 and 1280x900 in light and dark, plus 320x844 overflow checks; 135/135 pass.
- Browser states: mobile drawer, mobile theme toggle, cookie consent keyboard focus, reduced motion, forced colors, and console error check pass.
- Print emulation: dark-theme pages switch to explicit light print tokens, preserving dark text on a white surface.
- Visual QA: the audit article is readable at 1440x900 and 390x844 while the atmospheric background remains visible outside protected reading zones.
