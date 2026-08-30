/** Minimal RFC4180-ish CSV parser: handles quoted fields (embedded
 * commas, newlines, and escaped "" quotes) and bare unquoted fields.
 * Returns rows as arrays of raw string cells -- callers do their own
 * type coercion (see ProductImportDialog). Trailing blank lines are
 * dropped so a file ending in a newline doesn't produce a phantom
 * empty row. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  function endField() {
    row.push(field)
    field = ''
  }
  function endRow() {
    endField()
    rows.push(row)
    row = []
  }

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === ',') {
      endField()
      i += 1
      continue
    }
    if (ch === '\r') {
      i += 1
      continue
    }
    if (ch === '\n') {
      endRow()
      i += 1
      continue
    }
    field += ch
    i += 1
  }
  if (field.length > 0 || row.length > 0) {
    endRow()
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''))
}
