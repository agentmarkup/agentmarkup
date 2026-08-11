# React Bits sitewide visual system

## Objective

Carry one coherent React Bits-inspired visual language across all 27 public
routes without turning every page into a separate GPU-heavy demo.

## Scope and decisions

- Use one `GlassSurface` in the shared `Layout` header so every route receives
  the same floating navigation material.
- Apply pointer-angle `BorderGlow` behavior to card/link families and the main
  checker conversion panels. Status rows, legal panels, code, and tables keep
  explicit ordinary borders.
- Apply the upstream-style OGL specular rim to high-value primary actions. Do
  not stack it on submit buttons already contained by a glowing checker panel.
- Keep `GradientWaves` on the homepage hero.
- Add one `WebThreads` canvas to the Learning Center hero, with static fallback,
  capped DPR, visibility pausing, cleanup, and reduced-motion opt-out.
- Use a quiet static violet atmosphere on the general canvas so tools, docs,
  editorial pages, author, and legal routes still belong to the same system.
- Do not add Dock, Dither, or Ferrofluid in this iteration. Dock duplicates the
  existing navigation; Dither adds a Three/Postprocessing stack and changes the
  tone; Ferrofluid is too dominant for reading and audit workflows.

## Route families to verify

1. Homepage: `/`
2. Tools: `/checker/`, `/security-scan/`
3. Learning: `/learn/`
4. Docs: one representative plus the four-route build/SEO checks
5. Editorial: `/blog/`, one normal post, the Fortune 500 interactive post,
   author profile
6. Legal: terms/privacy and the panel-heavy license page

## Stop condition

- Typecheck, lint, tests, build, and SEO structure verification pass.
- Representative routes pass desktop/mobile, dark/light, console/network,
  overflow, navigation, focus, and reduced-motion checks.
- Navigation dropdowns are not clipped by the glass wrapper.
- Ambient WebGL stays limited to home and learning; any additional contexts are
  only the visible, high-value specular actions and are cleaned on route change.
- Session review finds no unresolved P0/P1 regression.
