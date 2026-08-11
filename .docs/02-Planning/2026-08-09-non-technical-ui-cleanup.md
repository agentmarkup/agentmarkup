# Non-technical UI cleanup

## Goal

Make AgentMarkup easier to scan and navigate for non-technical website owners while preserving the existing routes, SEO structure, and dark visual identity.

## Implemented

- Made desktop dropdowns and the mobile navigation drawer opaque.
- Removed decorative arrow glyphs and the homepage `Free / No signup` badges.
- Removed site navigation and contextual links to the redundant Learning Center route; direct guides and the blog remain discoverable.
- Removed the redundant three-step `Understand / Check / Build` homepage strip.
- Tightened the three-question explainer and removed its repeated outcome line, reducing the gap before the capabilities section.
- Widened homepage headings, long-form reading surfaces, Website Checker, and Security Scan.
- Replaced mixed rainbow card hover treatments with one restrained violet affordance limited to clickable cards.
- Replaced the scoped Product hero waves with the configured React Bits Molten Metal background across header and body while preserving an opaque, theme-aware footer.
- Added the approved black Molten palette for light mode, restored the light navbar, and made its compact cursor reflection black in light mode and transient in both themes.
- Replaced the long FAQ band with a compact entry card and accessible opaque modal with a dimmed backdrop.
- Made the Product hero text-first: removed duplicate CTAs and supporting outcome rows, centered the primary message, and moved the example result below the first viewport.
- Added a plain-language reading guide beside the sample result and expandable explanations for each finding.
- Added a clear hover state to the interactive Technical Questions disclosure.
- Moved the desktop article TOC farther left and hid it before it can overlap the footer.
- Simplified Product to hero, result preview, two clear tool choices, three use cases, and general FAQs.
- Restored the compact framework package installer (Next.js, Vite, Astro, and Nuxt) with its `pnpm add -D` command because installation is a primary Product action, while keeping full configuration examples in the guides.
- Moved the compact “find / understand / access” explanation below the Website Checker form and removed duplicated technical setup from Product.
- Restructured Website Checker around its primary task: concise contextual copy beside the URL form, simpler non-technical helper text, and a compact secondary Find / Understand / Access panel without changing checker behavior or SEO contracts.
- Normalized the Product example result surface across themes by removing the residual violet treatment and using one consistent semantic action red.
- Kept developer setup available through the existing GitHub repository and left the Learning Center indexable but unpromoted.
- Reworked the Product developer route into a complete GitHub card and added the GitHub mark to the footer link.
- Reduced the Product page's vertical gaps and widened use-case and FAQ content to match the three-card grid.

## Verification

- `pnpm typecheck`
- `pnpm test` — 122 tests passed
- `pnpm build`
- `pnpm verify:seo` — 27 routes verified, 26 original routes preserved
- Browser QA at 1600x1000 and 390x844 on `/`, `/checker/`, `/security-scan/`, and `/docs/audit/`
