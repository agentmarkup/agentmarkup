import type { JsonLdBase } from '../types.js';

/**
 * Serialize a JSON-LD object to a safe <script> tag for HTML injection.
 */
export function serializeJsonLd(schema: JsonLdBase): string {
  const json = JSON.stringify(schema, null, 2);
  const escaped = json
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/'/g, '\\u0027');

  return `<script type="application/ld+json">\n${escaped}\n</script>`;
}

export function generateJsonLdTags(schemas: JsonLdBase[]): string {
  return schemas.map(serializeJsonLd).join('\n');
}
