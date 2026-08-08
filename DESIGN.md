# AgentMarkup Design System

## 1. Atmosphere & Identity

AgentMarkup is a calm, plain-language guide for website owners and teams who do
not need to understand web infrastructure. The interface starts with a familiar
question—“Can AI tools understand your website?”—and a single website-address
field. Technical terms remain progressive disclosure, never the first layer.

The visual direction is **editorial clarity with evidence over decoration**:
optical paper, deep ink, a single coral action, and thin structural rules. A
visual element must explain a real check, state, or action; it never exists to
suggest generic "AI" complexity.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
|---|---|---|---|---|
| Canvas | `--bg` | `#FFFEFC` | `#10121A` | Page background |
| Surface | `--surface` | `#F8F5F0` | `#1A1D29` | Inputs and quiet bands |
| Surface elevated | `--surface-elevated` | `#FFFFFF` | `#222635` | Checker, code, menus |
| Ink | `--text` | `#111A43` | `#F8F5EF` | Headlines and primary copy |
| Body | `--text-body` | `#49506A` | `#C7CAD6` | Paragraphs |
| Muted | `--text-muted` | `#6D748B` | `#A4ABBC` | Supporting copy |
| Dim | `--text-dim` | `#9296A5` | `#747B90` | Metadata and disabled states |
| Rule | `--border` | `#E5E0D9` | `#353A4C` | Structural dividers |
| Rule strong | `--border-strong` | `#CFC7BC` | `#596078` | Controls and focus-adjacent lines |
| Indigo | `--cobalt-500` | `#273A8A` | `#AAB8FF` | Links, focus and technical detail |
| Coral | `--coral` | `#FF6E59` | `#FF8877` | Primary action and validation marker |
| Apricot | `--apricot` | `#FFD3A8` | `#795341` | Hero atmosphere |
| Blush | `--blush` | `#F8B9B7` | `#704B60` | Hero atmosphere |
| Success | `--status-success` | `#087A50` | `#58D6A1` | Passing findings |
| Warning | `--status-warning` | `#8A6100` | `#F2C866` | Warnings |
| Error | `--status-error` | `#B4232C` | `#FF858B` | Errors |

### Rules

- Cobalt communicates links and keyboard focus; it is never filler.
- Coral appears only on the primary action and explicit validation markers.
- Status colors always pair with text or iconography, never color alone.
- Dark mode preserves the same hierarchy rather than inventing a second brand.

## 3. Typography

### Font stacks

- Display: `Iowan Old Style, Baskerville, Georgia, serif`
- Body: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- Utility and code: `"SFMono-Regular", "SF Mono", Menlo, Consolas, monospace`

### Scale

| Level | Token | Size | Weight | Line height | Tracking | Usage |
|---|---|---|---|---|---|---|
| Display | `--type-display` | `clamp(3.25rem, 6.7vw, 6.75rem)` | 500 | 0.92 | -0.065em | Homepage thesis |
| Page title | `--type-page` | `clamp(2.5rem, 5vw, 4.75rem)` | 700 | 0.98 | -0.05em | Docs, blog, checker |
| Section | `--type-section` | `clamp(2rem, 4vw, 3.75rem)` | 700 | 1 | -0.045em | Major sections |
| H2 | `--type-h2` | `clamp(1.45rem, 2.3vw, 2.15rem)` | 650 | 1.08 | -0.025em | Section subheads |
| H3 | `--type-h3` | `1.125rem` | 650 | 1.3 | -0.015em | Row and card headings |
| Lead | `--type-lead` | `clamp(1.05rem, 1.7vw, 1.35rem)` | 400 | 1.55 | -0.01em | Introductory copy |
| Body | `--type-body` | `1rem` | 400 | 1.7 | 0 | Default copy |
| Small | `--type-small` | `0.875rem` | 450 | 1.55 | 0 | Supporting information |
| Utility | `--type-utility` | `0.75rem` | 550 | 1.4 | 0.055em | Labels, tabs, metadata |

Controls use the utility font stack at explicit sizes. Display type is never
used on form controls or dense documentation content.

## 4. Spacing & Layout

### Base unit

All spacing derives from 4px.

| Token | Value | Usage |
|---|---|---|
| `--space-1` | `4px` | Inline optical adjustment |
| `--space-2` | `8px` | Tight groups |
| `--space-3` | `12px` | Compact controls |
| `--space-4` | `16px` | Default gap |
| `--space-5` | `20px` | Comfortable text gap |
| `--space-6` | `24px` | Control and row padding |
| `--space-8` | `32px` | Component separation |
| `--space-10` | `40px` | Section internals |
| `--space-12` | `48px` | Large content gap |
| `--space-16` | `64px` | Section rhythm |
| `--space-20` | `80px` | Desktop section padding |
| `--space-24` | `96px` | Hero and major transitions |

### Grid

- Maximum content width: `1280px`
- Desktop: 12 columns, 24px gutters, 32px outer gutter
- Tablet: 8 columns, 20px gutters, 24px outer gutter
- Mobile: 4 columns, 16px gutters, 16px outer gutter
- Breakpoints: 640px, 768px, 1024px, 1280px
- Dense reports use two columns on desktop and a single reading column on mobile.

## 5. Components

### Site navigation

- **Structure:** skip link, wordmark link, primary links, theme button, mobile menu button.
- **Variants:** desktop inline, mobile disclosure.
- **States:** link default/hover/active/focus; buttons default/hover/pressed/focus.
- **Surface:** the sticky bar always uses the opaque page background; content may never show through it.
- **Accessibility:** native links/buttons, labelled controls, `aria-expanded`, Escape closes menu.
- **Motion:** 140ms color and 2px transform only.

### Action button

- **Structure:** plain, descriptive text; the primary action is the website-checker submit control.
- **Variants:** cobalt filled, ruled secondary, ink inverse.
- **States:** default, hover color, pressed, focus ring, disabled opacity.
- **Accessibility:** minimum 44px height and visible focus outline.

### Website checker field

- **Structure:** persistent label, URL input, submit button, truthful checklist, deterministic-note footer.
- **States:** default, hover, focus-within, disabled, invalid, loading, API error.
- **Accessibility:** native form semantics, explicit label, error live region on checker page. In a joined input/button control, focus uses an inset cobalt ring inside the input so it stays visible without colliding with the coral action.
- **Motion:** focus color only; no layout animation.

### What your check answers

- **Structure:** three plain-language questions beside the homepage checker:
  whether AI can find the site, understand its pages, and follow its access
  rules.
- **Purpose:** explains the actual scope of the checker before a visitor starts
  it, without a fake score, data visualization, or abstract AI metaphor.
- **Accessibility:** semantic heading plus ordered list; the content remains
  readable at every breakpoint.
- **Layout:** the hero uses two equal columns with shared top alignment; the
  supporting section uses an asymmetric text measure only where the headline
  needs more room than its explanatory paragraph.

### Homepage information order

- **Order:** checker and scope explanation, capability grid, concise product
  overview, checker and agent instructions, framework configuration, real
  build output, packages, use cases, then FAQ.
- **Rule:** retain the factual product material needed to evaluate and adopt
  the tool, but give every group one job. No repeated mission statement,
  secondary competing CTA, or promotional footer block.

### Homepage FAQ index

- **Structure:** a single centered reading rail with native `details` rows;
  the same one-column structure works from desktop to mobile.
- **Purpose:** makes a long list of questions scannable without inventing
  statuses, cards, or decorative effects.
- **Accessibility:** native `details`/`summary` controls; each question keeps
  a visible plus/minus affordance and a full-width hit target.

### Footer

- **Structure:** packages, docs, and community columns followed by a concise
  legal credit line with the MIT License and Terms links.
- **Purpose:** keeps global navigation useful without repeating a promotional
  hero or introducing another competing call to action.

### Landing-page grid

- **Structure:** explanatory landing sections share a centered 1180px outer
  grid. Capability summaries use three equal columns on desktop and ruled rows
  below that breakpoint; title-and-copy sections use a stable two-column grid.
- **Exception:** long-form documentation and FAQ answers use a narrower
  reading rail for legibility, not as a separate visual grid.

### Framework tabs

- **Structure:** native buttons followed by the selected command or code panel.
- **States:** default, hover, active, focus, pressed.
- **Accessibility:** active button uses `aria-pressed`; keyboard order follows DOM order.
- **Motion:** 140ms color and underline transform.

### Code panel

- **Structure:** utility header, copy button, line numbers, preformatted code.
- **Width:** documentation examples fill the reading rail so their edge aligns
  with the explanatory text; longer examples scroll horizontally when needed.
- **Length:** long, switchable configuration examples may use a fixed reading
  height with internal vertical scrolling; the copy control remains outside
  that scroll region.
- **States:** default, copy hover/focus/pressed, copied confirmation.
- **Accessibility:** copy button has an accessible name; horizontal overflow remains keyboard-scrollable.
- **Motion:** 140ms button feedback only.

### Ruled index row

- **Structure:** name and description separated by a thin rule.
- **Variants:** packages, use cases and blog index.
- **States:** default, hover/focus strengthens the link color without moving content.
- **Accessibility:** the complete row is a descriptive link with visible focus.

### Accordion

- **Structure:** native `details` and `summary`, answer content, CSS/SVG-like plus marker.
- **States:** closed, hover, focus, open.
- **Accessibility:** native disclosure behavior and logical headings.
- **Motion:** opacity/transform only; content does not animate height.

### Documentation surface

- **Structure:** page title, lead, ruled sections, lists, tables, code blocks.
- **Variants:** guide, blog post, checker results, security scan, license, author.
- **States:** links, controls, tables, status findings and errors.
- **Accessibility:** semantic heading order, readable line length, responsive tables, status text in addition to color.

## 6. Motion & Interaction

| Type | Token | Duration | Easing | Usage |
|---|---|---|---|---|
| Micro | `--motion-micro` | 140ms | ease-out | Buttons, links, tabs |
| Standard | `--motion-standard` | 220ms | ease-in-out | Menu and disclosure polish |
| Emphasis | `--motion-emphasis` | 600ms | cubic-bezier(0.16, 1, 0.3, 1) | Reserved for a future state transition with a real user benefit |

- Animate only `transform`, `opacity`, and color/filter where necessary.
- Interactive elements receive hover, pressed, and visible keyboard focus.
- `prefers-reduced-motion: reduce` collapses all non-essential durations.
- Decorative animation, pointer spotlights, ambient glows, and abstract AI
  diagrams are excluded.

## 7. Depth & Surface

Depth strategy: tonal paper-like surfaces separated by fine rules. Shadows are
not used as decoration. Corners are 6–8px for controls and functional panels;
information indexes remain flat. The hero uses the page canvas rather than an
atmospheric gradient.
