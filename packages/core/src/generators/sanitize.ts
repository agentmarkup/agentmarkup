/**
 * Returns true when a string contains ASCII control characters or newlines.
 * These bytes must never reach line-oriented output such as robots.txt or
 * _headers, where a newline lets a configured value inject additional
 * directives (e.g. a crafted crawler name emitting `User-agent: * / Disallow: /`).
 */
export function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}
