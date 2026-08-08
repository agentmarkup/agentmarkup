# AgentMarkup visual renewal — Loop Spec

**Status:** completed locally — implementation authorized by Teo on 2026-08-08.

## Objective

Make the entire AgentMarkup website feel like a confident, modern product for
AI-readable websites, while preserving the existing information architecture,
plain-language copy, light/dark modes, static-site delivery, and working
checker flow.

## Success / stop condition

- Every public route renders from the existing build and keeps its content and
  links intact.
- The homepage, checker, documentation/blog pages, navigation and footer share
  one restrained editorial system.
- Visual treatment is evidence-led: no decoration without a real product role.
- Desktop (1280px), tablet (768px) and mobile (375px) screenshots have no
  overlap, clipped content, unreadable contrast or broken navigation.
- `pnpm -C website build`, typecheck/lint where applicable, and browser checks
  pass. No production deployment, commit or PR is part of this work.

## Creative direction

"Evidence over decoration": an editorial system uses hierarchy, real product
explanations, fine rules and functional states to make machine-readability
understandable without generic AI symbolism.

- **Base:** true optical-paper light surface / deep ink dark surface.
- **Type:** existing characterful serif display, clean sans body, mono code.
- **Signature:** a plain-language "What your check answers" index beside the
  homepage form, tied directly to the checker’s real verification scope.
- **Action:** coral remains the one terminal action color; cobalt means links,
  focus and technical detail.
- **Depth:** tonal surfaces and hairline rules; no glow, blur, ambient shadow
  or repeated bento-card containers.

## Rejected decoration

| Component / idea | Target | Decision |
|---|---|---|
| `SpotlightCard`, orbit maps, node fields | Homepage and checker | Removed: they do not explain a real check. |
| Aurora, glow, gradients, glass blur | Whole site | Removed: atmosphere cannot compete with content. |
| Decorative entrances and hover lifts | Whole site | Removed: motion remains only where it gives interaction feedback. |
| Fake scores, counters and status metaphors | Homepage | Excluded: checker reports only deterministic findings. |
| Cursors, WebGL, 3D, physics and gallery effects | Whole site | Excluded. |

## Non-goals

- No copy rewrite, route re-architecture, API/checker business-logic change,
  analytics, deployment, database change, new animation framework, Three.js,
  GSAP, or Motion dependency without a new approval.
- No fabricated readiness claims, scores, status signals or testimonials.

## Known facts

- The site is React 19 + Vite and uses plain CSS with a documented design
  system in `DESIGN.md`.
- The workspace has intentional uncommitted changes before this work; they
  must be preserved and never reset.

## Risk gates / approvals

- This work is local UI only. Stop and ask before deployment, a new dependency,
  changing checker API behavior, modifying the existing written product claims,
  or touching unrelated package code.
- A generated concept image is reference-only and is not shipped as a website
  asset unless explicitly selected later.

## Execution loop

1. Inventory all public page families and freeze the visual contract in
   `DESIGN.md` and this plan.
2. Build shared CSS primitives: navigation, section rhythm, buttons,
   explanatory index, panel/row/code surfaces, focus and reduced-motion behavior.
3. Apply the shared system to home and checker first; verify their real flows.
4. Apply it to documentation, blog, author and utility page families without
   altering their semantic content.
5. Build and inspect desktop/mobile routes; repair only evidence-backed issues.
6. Audit scope, dirty worktree preservation, accessibility and verification;
   update this plan with the actual result.

## Verification matrix

| Requirement / risk | Check | Hard gate |
|---|---|---|
| Existing app compiles | `pnpm -C website build` | yes |
| Type-safe site | `pnpm -C website typecheck` | yes |
| Shared design works | Browser screenshots at 375/768/1280px | yes |
| Primary flow still works | Submit a valid URL in homepage and checker form | yes |
| Accessible interaction | Keyboard focus, nav/menu, theme toggle, visible contrast | yes |
| Decorative motion is absent | Inspect CSS and reduced-motion rules | yes |
| No accidental runtime bloat | Inspect dependencies and browser console/network | yes |
| All page families inherit system | Spot-check home, checker, one docs page, blog index/post, author, license | yes |

## Run log

- 2026-08-08: Teo approved full-site implementation and allows dependencies if
  needed. Decision: start dependency-free and use CSS/React equivalents;
  revisit dependencies only if a real requirement cannot be met.
- 2026-08-08: Generated and reviewed homepage, checker and documentation
  visual concepts as reference-only design inputs. The implementation keeps
  AgentMarkup's current content and uses the "visible structure" motif.
- 2026-08-08: Extended the shared editorial system across the checker, docs,
  blog, author and license page families. Added a checker-only decorative
  structure field and documented it in `DESIGN.md`; no React Bits package,
  animation framework or generated image asset was added.
- 2026-08-08: Browser QA passed for homepage (1280px and 375px), docs
  (768px light and desktop dark), checker (desktop + local error state), blog,
  license and author. Mobile navigation and both themes rendered correctly.
  An initial checker overflow was traced to the decorative field and fixed by
  clipping it to the checker page.
- 2026-08-08: `tsc -b`, ESLint, Vite production build and `git diff --check`
  passed. Browser console had no errors. The live checker success state remains
  unverified locally because `/api/check` is supplied by the Cloudflare Pages
  worker, not plain Vite.
- 2026-08-08: Follow-up density pass from Teo's visual review: the capability
  cards now use a readable two-column ledger with a full-width closing item;
  build output is a constrained secondary panel rather than a full-width
  screenshot; packages use a two-column product ledger; and FAQ now meets the
  footer without the former dead zone. Desktop dark-mode review, console,
  overflow, ESLint, TypeScript, production build and `git diff --check` passed.
- 2026-08-08: Teo rejected the orbit/glow treatment as AI slop. Removed the
  `SpotlightCard`, hero signal map, checker structure field, decorative
  gradients, blur, ambient shadows, hover lifts and orphaned readiness CSS.
  Replaced the hero’s right side with a plain-language index of what the real
  checker answers. Updated `DESIGN.md` to make evidence over decoration the
  visual contract; desktop, tablet and mobile browser QA, focus/menu checks,
  console, TypeScript, ESLint, Vite build and `git diff --check` passed.
- 2026-08-08: Integrated upstream `security-scan` route after a safe rebase.
  Resolved the `Layout.tsx` and lockfile conflicts in favour of upstream while
  preserving the local editorial navigation and CSS. The new security scan
  shares the checker’s functional surface; its passive-use notes are a ruled
  ledger, not decorative cards. Replaced the joined URL control's external
  focus outline with an inset cobalt ring so it no longer overlaps the coral
  submit button. ESLint, TypeScript, production build and conflict checks pass.
  Vitest is pending because pnpm's release-age policy blocks installation of
  newly introduced `happy-dom` locally; no policy bypass was used.
- 2026-08-08: Follow-up homepage polish: made the sticky navigation fully
  opaque after the transparent override allowed content to show through it.
  Reworked the homepage FAQ as a numbered editorial index with a title rail on
  desktop and a one-column mobile fallback. Browser checks confirmed opaque
  dark/light navigation and no overflow at 1280px and 375px.
- 2026-08-08: Teo rejected the split FAQ layout as too empty. Replaced it with
  a compact centered reading rail. An unrelated in-progress Security Scan
  report redesign was explicitly discarded before completion; no
  risk-prioritization code was retained.
- 2026-08-08: Global evidence-over-decoration pass: removed the temporary
  footer promotion, decorative code labels and blog arrows, rounded promo
  surfaces, and chip-style metadata. The remaining primary action is the real
  checker form. Added the `/terms/` route and exposed it with the MIT License
  in the footer legal line.
- 2026-08-08: Homepage information-architecture pass: removed the repeated
  mission section and duplicate guide directory. The homepage now follows one
  clear order—checker, three capability signals, real build output and FAQ.
  Capability signals use three equal desktop columns and stack into ruled rows
  at smaller widths. Browser review passed at 1280px and 375px; the build
  output includes the complete “No issues found” line.
- 2026-08-08: Production-content parity correction: after comparing the live
  homepage with the local generated Markdown, restored the factual sections
  that had been removed too aggressively—six capabilities, product overview,
  checker and agent instructions, framework configuration, packages, use
  cases, and the complete FAQ. The content now follows the editorial order in
  `DESIGN.md`; it is not a byte-for-byte copy of the older production layout.
