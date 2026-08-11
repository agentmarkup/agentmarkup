# Gradient Waves homepage hero

Status: implemented and verified locally

## Contract

- Adapt React Bits Gradient Waves to the existing AgentMarkup hero rather than copying its demo layout.
- Preserve homepage copy, links, section order, result preview, SEO structure, and both themes.
- Keep the effect decorative, responsive, and non-blocking, with no pointer interaction.
- Respect reduced motion and retain a static CSS fallback when WebGL is unavailable.

## Implementation

1. Add the `ogl` runtime used by the upstream Gradient Waves component.
2. Render one low-complexity raymarched wave canvas behind the existing hero content.
3. Tune the shader to the AgentMarkup violet palette and pause rendering while offscreen or hidden.
4. Keep the canvas out of the accessibility tree and omit it for reduced-motion users.
5. Document the React Bits adaptation in the existing third-party notice.

## Verification result

- Website typecheck and 119/119 unit tests passed.
- Desktop dark, mobile dark, and mobile light browser checks show no overflow or console warnings/errors.
- A pair of browser frames captured 600ms apart confirmed that the canvas animates.
- The existing copy, semantic structure, controls, and result preview remain unchanged.
