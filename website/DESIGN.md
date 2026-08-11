# AgentMarkup Design System

## 1. Atmosphere & Identity

AgentMarkup feels like a calm website health guide: precise enough to earn a developer's trust, but designed first for a website owner who does not know or need technical terminology. The dark canvas stays neutral black. Color appears only when it helps someone interpret a result or find an action.

The signature is the **Three-answer preview** — a believable sample website result that shows “Looks good”, “Needs attention”, and “Action required” together. A visitor should understand within one glance that AgentMarkup checks whether AI can find, understand, and access a website, then explains what to do next.

### Primary persona and cognitive rules

- Default persona: a website owner or marketer who can paste a URL but may not know JSON-LD, robots.txt, crawler names, build tools, or framework terminology.
- The first viewport answers three questions in order: what this is, what answer the visitor receives, and where to start. The hero promise stays under seven words and the supporting sentence stays under two short lines on desktop.
- Plain-language outcomes precede implementation terms. Technical names remain available under “Technical details” or the developer disclosure.
- No section asks the visitor to remember terminology from a previous section. Labels remain stable across homepage, Checker, and Security Scan.
- A semantic color always includes an icon and an explicit status phrase; color is reinforcement, never the only signal.
- Recognition takes priority over recall: orient visitors by their goal, keep each primary choice group to three options, and introduce plain language before technical terminology.
- Existing search-visible structure is a product constraint. Canonicals, authored H1/H2 order, section IDs, JSON-LD types, internal links, and prerendered content remain stable unless the site owner explicitly approves a structural change.
- Disclosures progressively reduce visual density, but their complete content must remain present in prerendered HTML.

## 2. Color

### Palette

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Canvas | `--canvas` | `#F7F8FC` | `#050505` | Page background |
| Canvas/deep | `--canvas-deep` | `#EDF1F8` | `#020202` | Hero and footer depth |
| Surface/primary | `--surface-primary` | `#FFFFFF` | `#0B0B0C` | Primary content surfaces |
| Surface/secondary | `--surface-secondary` | `#EFF3F9` | `#111113` | Grouped content and quiet controls |
| Surface/elevated | `--surface-elevated` | `#FFFFFF` | `#151517` | Dialogs and menus |
| Fixed dark canvas | `--fixed-dark-canvas` | `#020202` | `#020202` | Theme-invariant modal surfaces |
| Fixed dark surface | `--fixed-dark-surface` | `#0B0B0C` | `#0B0B0C` | Navigation in both themes |
| Fixed dark text | `--fixed-dark-text-primary` / `--fixed-dark-text-secondary` | `#F7F9FC` / `#B8C3D6` | Same | Text on fixed dark surfaces |
| Fixed dark border | `--fixed-dark-border` | `#303034` | `#303034` | Dividers and controls on fixed dark surfaces |
| Text/primary | `--text-primary` | `#111827` | `#F7F9FC` | Headings and body |
| Text/secondary | `--text-secondary` | `#4B5567` | `#B8C3D6` | Supporting copy |
| Text/tertiary | `--text-tertiary` | `#626B7A` | `#91A0B8` | Metadata; never essential at small sizes |
| Border/default | `--border-default` | `#CED7E5` | `#303034` | Controls and strong separation |
| Border/subtle | `--border-subtle` | `#E1E7F0` | `#1D1D20` | Dividers and quiet surfaces |
| Brand/primary | `--brand-primary` | `#1D4ED8` | `#4F7CFF` | Primary actions, links, focus |
| Brand/hover | `--brand-hover` | `#173EA9` | `#7AA2FF` | Interactive hover |
| Brand/accent | `--brand-accent` | `#2457D6` | `#8FB0FF` | Labels, selected navigation, quiet atmosphere |
| Brand/strong | `--brand-strong` | `#153EAF` | `#315FDE` | Dimensional brand light only |
| Action/fill | `--action-fill-start` / `--action-fill-end` | `#1D4ED8` / `#153EAF` | `#315FDE` / `#1D4ED8` | Primary action gradient |
| Action/hover | `--action-hover-start` / `--action-hover-end` | `#2457D6` / `#173EA9` | `#3A63D4` / `#2457D6` | Primary action hover gradient |
| Action/rim | `--action-rim` | `#8FB0FF` | `#8FB0FF` | Decorative edge and static reflection only |
| Action/shadow | `--action-shadow` | `rgba(15, 23, 42, 0.18)` | `rgba(0, 0, 0, 0.28)` | Restrained neutral primary-action depth |
| Reading/shield | `--reading-shield` | `rgba(247, 248, 252, 0.94)` | `rgba(2, 2, 2, 0.92)` | Continuous contrast layer behind page content |
| Status/good | `--status-good` | `#087A4A` | `#39D98A` | “Looks good” only |
| Status/good-soft | `--status-good-soft` | `#E8F7EF` | `#0B2B22` | Good-state surface |
| Status/attention | `--status-attention` | `#A84F00` | `#FFB020` | “Needs attention” only |
| Status/attention-soft | `--status-attention-soft` | `#FFF2DF` | `#30220A` | Attention-state surface |
| Status/action | `--status-action` | `#C62137` | `#FF6577` | “Action required” only |
| Status/action-soft | `--status-action-soft` | `#FDECEF` | `#33121A` | Action-state surface |
| Status/info | `--status-info` | `#155EEF` | `#63A0FF` | Informational state |
| Status/info-soft | `--status-info-soft` | `#EAF2FF` | `#10264A` | Information surface |
| Status/neutral | `--status-neutral` | `#596579` | `#A6B2C6` | Unverified or unavailable |
| Code/text | `--code-text` | `#C7D0DF` | `#C7D0DF` | Text on the always-dark code surface |
| Code/muted | `--code-muted` | `#91A0B8` | `#91A0B8` | Line numbers on the always-dark code surface |

### Rules

- Cobalt is the brand and navigation family. It never means pass, warning, or error.
- Primary actions use the cobalt-to-ultramarine action ramp with white text. Ice blue is decorative and never sits behind essential text.
- Primary actions are CSS-only: no WebGL rim, sweeping shine, colored bloom, or translucent glass fill.
- Informational blue remains lighter than the cobalt brand ramp and is used only with an explicit status label.
- Brand and semantic status colors never substitute for one another.
- A status always combines color with an icon, explicit label, and a distinct border or pattern.
- Essential text meets WCAG 2.2 AA in both themes. Small text targets at least 4.5:1; controls and focus indicators at least 3:1.
- Decorative atmosphere uses translucent versions of palette tokens. No unlisted opaque colors are introduced in components.

## 3. Typography

### Scale

| Level | Size | Weight | Line height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Display | `clamp(3rem, 4.5vw, 4.75rem)` | 500 | 0.98 | `-0.04em` | Homepage hero |
| Page title | `clamp(2.5rem, 5vw, 4.75rem)` | 500 | 1.02 | `-0.035em` | Article and tool titles |
| H2 | `clamp(2rem, 3.5vw, 3.5rem)` | 500 | 1.08 | `-0.025em` | Major sections |
| H3 | `clamp(1.25rem, 2vw, 1.6rem)` | 650 | 1.25 | `-0.012em` | Cards and subsections |
| Body/large | `1.125rem` | 430 | 1.7 | `-0.005em` | Leads and editorial copy |
| Body | `1rem` | 430 | 1.65 | `0` | Default copy |
| Body/small | `0.875rem` | 500 | 1.5 | `0` | Metadata and helper text |
| Label | `0.75rem` | 700 | 1.35 | `0.06em` | Compact labels and status text |

### Font stack

- UI and body: `Manrope Variable`, with `Manrope`, `Avenir Next`, `Segoe UI`, and system sans fallbacks.
- Display and editorial: `Source Serif 4 Variable`, with `Iowan Old Style`, `Baskerville`, `Georgia`, and serif fallbacks.
- Code: `SFMono-Regular`, `Cascadia Code`, `Roboto Mono`, monospace.
- The serif is used for major narrative headings, not controls or operational labels.

### Rules

- Body copy is never smaller than 14px.
- Long-form article paragraphs and substantive list items share the Body token (`1rem` / `1.65`). Smaller sizes are reserved for metadata, labels, helper text, legends, and code annotations—not authored reading content.
- Long-form reading surfaces use an approximately 52rem maximum so headings and short paragraphs do not wrap prematurely; individual prose paragraphs still target a comfortable 66–76 character measure where practical. Operational surfaces may be wider for comparison.
- Headings use `text-wrap: balance`; body copy uses `text-wrap: pretty` where supported.

## 4. Spacing & Layout

### Base unit

All spacing derives from a 4px base.

| Token | Value | Usage |
| --- | --- | --- |
| `--space-1` | `4px` | Icon gaps |
| `--space-2` | `8px` | Inline groups |
| `--space-3` | `12px` | Compact controls |
| `--space-4` | `16px` | Standard inner spacing |
| `--space-5` | `20px` | Comfortable inner spacing |
| `--space-6` | `24px` | Card padding |
| `--space-8` | `32px` | Component groups |
| `--space-10` | `40px` | Section interiors |
| `--space-12` | `48px` | Major breaks |
| `--space-16` | `64px` | Page rhythm |
| `--space-20` | `80px` | Hero spacing |
| `--space-24` | `96px` | Largest section separation |

### Grid

- Maximum product width: `1664px`; default content width: `1280px`; reading width: `832px`.
- Desktop uses a 12-column grid with 24px gutters. Mobile uses a single column with 20px margins.
- Breakpoints: 640px, 768px, 1024px, 1280px.
- The sticky global header is 72px desktop and 64px mobile. Anchors and focused content reserve that offset.

### Rules

- Homepage sections use generous 96–144px desktop separation and 64–96px mobile separation. Internal component spacing stays visibly smaller than section spacing.
- The homepage journey is: centered text-first promise with a direct URL check → framework install → sample answer → choose Website Checker or Security Scan → compact technical coverage → use cases → FAQ. Product exposes the shortest checking and installation paths before secondary explanations; the tool pages and guides contain the full detail.
- Website Checker follows Product's centered editorial entry rhythm without becoming a second landing page: a concise centered promise leads into one wide URL form panel in the first viewport, followed by the compact Find / Understand / Access explanation and one crawlable scope block naming the public signals checked. Results, errors, and verification states keep their existing functional hierarchy.
- Marketing sections may use purposeful asymmetry around the result preview. Tools and long-form pages favor predictable alignment.
- The first viewport of a tool always contains its title, context, form, and primary action.
- Dense technical material is grouped or disclosed, never deleted or hidden from the HTML source.

## 5. Components

### Global navigation

- **Structure:** skip link, brand, grouped desktop links/disclosures, theme control, mobile drawer trigger.
- **Variants:** desktop bar and modal-like mobile drawer.
- **States:** current route, open, hover, focus, active. Dropdowns and the mobile drawer use opaque elevated surfaces so underlying content never competes with navigation text.
- **Accessibility:** `aria-current`, native disclosure controls, Escape/outside close, focus containment and return, scroll lock.
- **Motion:** 240ms transform/opacity drawer transition; static under reduced motion.

### Spotlight surface

- **Structure:** semantic container with a pointer-followed visual layer and normal content.
- **Variants:** brand, information, and neutral. Status is not a spotlight variant.
- **States:** default, hover, focus-within.
- **Accessibility:** decoration is hidden; content order is unchanged.
- **Motion:** background-position only on fine pointers; no motion under reduced motion.

### Three-answer preview

- **Structure:** example domain, overall verdict, three plain-language result rows, and one example next step.
- **Variants:** hero sample and compact educational sample.
- **States:** good, attention, and action shown together as an explicitly labelled example, never presented as a real audit.
- **Accessibility:** every row combines SVG icon, status label, heading, and explanation. DOM order matches visual order.
- **Depth:** solid result surface, subtle cobalt rim light, and semantic inset surfaces; no orbital, grid, terminal, or scanner metaphor.
- **Motion:** one restrained 600ms entrance for the complete panel; status rows do not pulse or animate independently.

### Sitewide molten metal

- **Role:** one fixed React Bits Molten Metal canvas forms the continuous visual atmosphere behind the header, page body, and footer on every route.
- **Configuration:** `detail 2`, `swirl 1.4`, `brightness 0.5`, `coreSize 0.15`, `scale 3.7`, `speed 0.45`, `glow 1.65`, and `fold -0.32`; remaining controls retain the React Bits defaults.
- **Depth:** content panels stay opaque enough for legibility while the glass navigation and translucent footer reveal the same uninterrupted background.
- **Theme treatment:** dark mode uses a restrained cobalt-to-ice palette; light mode uses `#000000`, `#242424`, and `#212121` with the same motion settings. The navbar follows the active theme, and its compact cursor reflection switches from white to black in light mode.
- **Protected reading zones:** every page shell carries one continuous neutral reading shield. It reaches full strength exactly at the content gutter and fades to transparent across the outer gutter, keeping the shader visible around the content without letting bright filaments cross text, tables, charts, forms, or article navigation. The footer remains opaque while following the active light/dark theme. The homepage exposes its complete FAQ inline on an opaque reading surface.
- **Motion:** animation pauses when the document is hidden. Reduced-motion users receive a static rendered frame, and forced-colors mode removes the decorative layer.

### Glass surface navigation

- **Role:** the centered floating header is the sitewide visual signature and appears on every public route.
- **Implementation:** one React Bits-inspired SVG displacement surface wraps the shared navigation. Firefox/Zen and other browsers without SVG backdrop-filter support receive a translucent 28px-blur fallback with the same cursor reflection; the material stays neutral charcoal/white with chromatic color limited to the rim.
- **Accessibility:** the filter SVG is decorative, navigation semantics stay native, and forced-colors mode removes the glass treatment.

### Interactive card affordance

- **Role:** a restrained, single-cobalt pointer rim and small lift make clickable card-like links unmistakable without introducing competing rainbow states.
- **Scope:** blog cards, featured editorial links, learning paths, Product option cards, and developer paths.
- **Exclusions:** result previews, checker panels, status rows, informational articles, findings, legal panels, tables, and dense operational results keep ordinary borders because the complete surface is not clickable.
- **Fallbacks:** touch, coarse pointer, reduced-motion, and forced-colors presentations retain their ordinary borders and focus outlines.

### Cobalt action

- **Role:** every high-value primary action uses the same short cobalt-to-ultramarine ramp, static ice-blue upper edge, and restrained neutral-tinted shadow.
- **Implementation:** CSS-only and token-driven. The button remains opaque enough for dependable text contrast in both themes and never adds a second animation loop.
- **States:** hover shifts to the declared action-hover ramp and lifts by one pixel; active uses the normal press response; disabled returns to the neutral secondary surface.
- **Accessibility:** white text clears WCAG AA against every fill endpoint; focus remains a separate visible outline rather than relying on the decorative rim.

### Web threads

- **Role:** the Learning Center hero uses one vivid but content-safe thread field to signal connected learning paths and technical relationships as an intentional showcase moment.
- **Color:** threads run from cobalt `#1D4ED8` to ice blue `#8FB0FF`; white is used only in the brightest decorative core.
- **Scope:** one canvas on the learning route only; long-form reading, legal pages, and operational tool results use the static site atmosphere instead.
- **Motion:** rendering pauses outside the viewport or while the document is hidden, and the canvas is omitted under reduced motion.

### Audience path links

- **Structure:** three descriptive links for understanding the product, checking a website, and opening developer material.
- **States:** default, hover, pressed, focus.
- **Accessibility:** each link names its destination and uses ordinary anchors; no card relies on click-only container behavior.

### Product option

- **Structure:** two equal plain-language destination links for Website Checker and Security Scan, followed by one quieter external developer route.
- **States:** default, hover, pressed, and focus use the same cobalt affordance for both tools; status colors are never used to distinguish destinations.
- **Accessibility:** complete surfaces are ordinary descriptive anchors, work without JavaScript, and retain visible keyboard focus.
- **Cognitive rule:** Product explains which check to choose and preserves one compact framework install command because package installation is a primary product action. It does not duplicate the full setup guides or package documentation.

### Framework install

- **Structure:** one short explanation, four framework tabs, the current `pnpm add -D` command, a Copy control, and the matching npm package link.
- **States:** default framework, selected framework, hover, focus, and copied confirmation.
- **Accessibility:** tabs expose selected state, the command update is announced politely, and installation remains readable without copying.

### GitHub developer route

- **Structure:** a complete external-link card with the GitHub mark, an audience label, and a plain-language setup description. The same mark appears beside the GitHub footer link.
- **States:** the card follows the shared cobalt card affordance; the footer link retains its lightweight text-link treatment.
- **Accessibility:** the SVG is decorative because the surrounding link text names GitHub; external links use `target="_blank"` with `rel="noopener noreferrer"`.

### Learning path

- **Structure:** a compact goal label, plain-language description, destination, and optional audience/level metadata.
- **Variants:** primary orientation path, topic path, website-type path, and quiet developer path.
- **States:** default, hover, pressed, focus, and current destination where applicable.
- **Accessibility:** ordinary descriptive anchors; no JavaScript is required to discover or follow a path.
- **Cognitive rule:** a primary orientation block contains no more than three choices.

### Editorial metadata

- Every article has one `audience` (`plain-language`, `technical`, or `research`), one topic, and one level (`beginner`, `intermediate`, or `advanced`).
- Visible labels use reader-facing wording such as “Website owners”, “People who build websites”, and “Research”, rather than exposing internal enum values.
- Blog filters change presentation only. Every article remains in the initial server-rendered HTML and has an ordinary crawlable link.
- The Blog index uses an editorial journal hierarchy: compact masthead, visible audience toolbar, one split featured story, then opaque topic shelves with individually clickable article cards. Article content and H1/H2/H3 semantics stay unchanged.
- Every article ends with one shared editorial outro: author and primary next reading share a 55/45 divided row, previous/next navigation follows the publication order beneath it, and three deduplicated related articles lead to the complete Blog index. On mobile the same content follows a single author → recommendation → publication order → related reading sequence.

### Plain-language summary

- **Structure:** difficulty, intended audience, estimated time, two or three jargon-free sentences, and one relevant action.
- **Placement:** after the existing guide introduction and before the first authored H2, without changing the page’s heading hierarchy.
- **Rule:** it supplements technical material; it never replaces or lazy-mounts authored content.

### Homepage FAQ

- **Structure:** section heading and the complete question-and-answer list share one two-column reading surface on desktop and one column on mobile.
- **Interaction:** native `details` disclosures keep the page scannable without moving the content into a modal or loading it after interaction.
- **Accessibility and discovery:** every question and answer remains present in prerendered HTML and the Markdown mirror, with ordinary keyboard-operable summaries.

### Button and field

- **Variants:** primary, secondary, quiet, destructive; text, URL, checkbox.
- **States:** default, hover, active (120ms), focus, disabled, loading, invalid.
- **Accessibility:** explicit labels, 44px comfortable target, visible focus ring, inline associated errors, no placeholder-only labels.

### Semantic status and verdict

- **Structure:** icon, label, optional count and explanation.
- **Variants:** good, attention, action, information, neutral.
- **States:** static result or filter control.
- **Accessibility:** SVG is decorative when text is present; shape and wording convey meaning without color.
- **Motion:** 220ms state transition; no pulsing error or success effects.

### Fortune 500 signal explorer

- **Structure:** each of the three signal matrices renders the same ordered 370-company dataset as 28 columns and 14 rows; the final row contains the remaining six companies.
- **Consistency:** Structured data, llms.txt, and Content-Signal always share identical geometry and company positions. Only the semantic on/off state changes between matrices.
- **Responsive behavior:** the 28-column geometry remains stable on desktop and mobile, without cropping or horizontal page overflow.
- **Accessibility:** every company is a native button with a domain/status label, roving keyboard focus, arrow-key navigation, and the shared result dialog.

### Finding

- **Structure:** status + title, “What happened”, “What this means”, and actionable documentation/next step when supplied by existing data.
- **Variants:** good, attention, action.
- **States:** default and expanded where technical detail is disclosed.
- **Accessibility:** semantic article/heading, stable reading order, filter controls announce counts.

### Code block

- **Structure:** optional filename/header, `pre > code`, Copy button, polite status region.
- **States:** default, copied, failure, focus.
- **Accessibility:** changing accessible name and announced result; keyboard native button.

### Table

- **Structure:** scroll wrapper where authored; existing tables receive safe horizontal overflow behavior.
- **States:** default and focused scroll region on narrow screens.
- **Accessibility:** column and row headers, caption or surrounding heading, visible focus, no content loss at 200% zoom.

### Reading tools

- **Structure:** reading progress and generated “On this page” navigation from authored headings.
- **Variants:** sticky desktop rail, inline mobile disclosure.
- **States:** active section, collapsed mobile state, and hidden after the reading column ends so the rail never overlays article recommendations or the site footer.
- **Accessibility:** landmarks and ordinary anchor links; progress has a text alternative.

### Dialog

- **Structure:** native `dialog`, heading, content, close control.
- **States:** closed/open.
- **Accessibility:** browser focus containment, Escape close, trigger focus restoration, labelled dialog.
- **Motion:** 220ms opacity/transform where supported; immediate under reduced motion.

### Cookie preferences

- **Structure:** consent explanation and accept/decline controls, reopened from permanent footer control.
- **States:** first visit, stored decision, reopened.
- **Accessibility:** labelled region/dialog behavior, predictable focus, no obscured controls.

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Press | 120ms | `ease-out` | Button press |
| Standard | 240ms | `ease-in-out` | State, disclosure, drawer |
| Important | 600ms | `cubic-bezier(0.16, 1, 0.3, 1)` | Hero entrance |
| Ambient | continuous | slow shader time | Sitewide molten metal and Learning Center web threads; meaning never depends on motion |

- Animate transform, opacity, filter, and pointer-positioned paint only; never animate layout.
- Ambient WebGL uses one sitewide Molten Metal canvas; the Learning Center may additionally use its scoped cobalt-to-ice Web Threads illustration. Primary actions remain CSS-only.
- `prefers-reduced-motion: reduce` removes ambient and entrance motion and preserves all information statically.
- Motion appears at high-value moments, not as a generic reveal on every section.

## 7. Depth & Surface

The depth strategy is **mixed but restrained**: tonal shifts and precise borders provide the hierarchy; shadows are reserved for floating navigation, drawers, and dialogs.

| Level | Treatment | Usage |
| --- | --- | --- |
| Inline | Tonal shift + subtle border | Sections, code, findings |
| Raised | `0 12px 40px rgba(2, 8, 23, 0.10)` | Menus and conversion surfaces |
| Floating | `0 24px 80px rgba(2, 8, 23, 0.28)` | Drawer and dialog |

- The dark theme uses neutral black materials; blue never tints the page canvas.
- Glass effects appear only in navigation, with translucent blurred Firefox/Zen fallbacks and forced-colors solid fallbacks.
- Operational result areas use solid surfaces so status color and text remain unambiguous.
- Nested cards are avoided; dividers and spacing express most hierarchy.
