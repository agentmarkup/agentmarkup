// Minimal RFC 4180 CSV reader and writer for the batch scripts: quoted fields,
// doubled quotes, newlines inside quotes, CRLF tolerated. No dependencies.

/** Parses CSV text into an array of row objects keyed by the header line. */
export function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { header: [], rows: [] };
  const [header, ...body] = rows;
  const records = body
    .filter((row) => row.length > 1 || (row.length === 1 && row[0] !== ''))
    .map((row) => {
      const record = {};
      header.forEach((name, index) => {
        record[name] = row[index] ?? '';
      });
      return record;
    });
  return { header, rows: records };
}

/** Parses CSV text into an array of string arrays. */
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function escapeField(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV line (no trailing newline). */
export function csvLine(values) {
  return values.map(escapeField).join(',');
}

/** A whole CSV document from a header and rows of values. */
export function stringifyCsv(header, rows) {
  return [csvLine(header), ...rows.map((row) => csvLine(row))].join('\n') + '\n';
}
