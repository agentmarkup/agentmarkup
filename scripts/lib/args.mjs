// Shared option-value reader for the scripts' argument parsers.

/**
 * The value of the option at `argv[index]`, read from `argv[index + 1]`. A
 * missing or empty value, or a next token that starts with `-` (another flag),
 * is a usage error reported through `fail`, which is expected to exit. If it
 * returns, this throws, so a parser can never carry on with `undefined` (a
 * trailing `--compare` must not turn into a capture).
 */
export function optionValue(argv, index, fail) {
  const name = argv[index];
  const value = argv[index + 1];
  if (value === undefined || value === '' || value.startsWith('-')) {
    const message = `${name} expects a value`;
    fail(message);
    throw new Error(message);
  }
  return value;
}
