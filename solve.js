// csv-reader-speed-01-run-20261121: a faster drop-in for csv-reader 1.0.0.
//
// run(input) returns exactly csv-reader 1.0.0's answer for {text, header}:
// {columns, rows, errors}, following its written broken-row policy:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote, and each CRLF or lone CR inside it is read as LF;
//     what follows its closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk, when the field ends);
//   - a quote that never closes is a literal character, and the text after it is
//     read again as an unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded with "" (short_row, with fields: its count)
//     or cut (long_row, with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met, a record's short_row or
//     long_row when it ends: line the 1-based line its record starts on, counting
//     every LF, CRLF and lone CR inside quotes, and row its record's index in
//     rows, null for the header.
//
// Speed: one pass, slice-based. Unquoted fields are taken as slices, never built
// a character at a time; a whole line with no quote and no stray CR is split
// natively in one go; quoted fields are located with indexOf and their doubled
// quotes and line breaks resolved on the slice. Only the rare broken rows fall
// back to segment assembly.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** The reading of one CSV input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read (set by scanUnquoted / readQuoted).
  let fieldValue = '';
  let fieldEnded = END;

  // Scans an unquoted field (or the junk after a closing quote) from pos.
  // init is the value so far ('' normally, '"' after a quote that never closes,
  // the quoted content for junk). When junk is true, a quote_junk error is
  // recorded when any character is kept. Sets fieldValue / fieldEnded.
  function scanUnquoted(init, junk) {
    let start = pos;
    let parts = null; // segments kept before a dropped stray CR
    let ended = -1; // undecided until a terminator is met
    let endPos = len;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 44) {
        endPos = pos;
        ended = COMMA;
        pos += 1;
        break;
      }
      if (c === 10) {
        endPos = pos;
        ended = LINE_BREAK;
        pos += 1;
        line += 1;
        break;
      }
      if (c === 13) {
        if (pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
          endPos = pos;
          ended = LINE_BREAK;
          pos += 2;
          line += 1;
          break;
        }
        // A CR not followed by LF is dropped (stray_cr); the field goes on.
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (parts === null) parts = [];
        parts.push(text.slice(start, pos));
        pos += 1;
        start = pos;
        continue;
      }
      pos += 1;
    }
    if (ended === -1) {
      endPos = len;
      ended = END;
    }
    if (parts === null) {
      fieldValue = init === '' ? text.slice(start, endPos) : init + text.slice(start, endPos);
    } else {
      parts.push(text.slice(start, endPos));
      fieldValue = init + parts.join('');
    }
    if (junk && fieldValue.length > init.length) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    fieldEnded = ended;
  }

  // Reads a quoted field whose opening quote is at pos. Returns false when the
  // quote never closes (the caller then re-reads as unquoted); otherwise sets
  // fieldValue / fieldEnded and returns true.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let segStart = pos;
    let parts = null; // segments before a doubled quote, joined with one '"'
    let closeAt = -1;
    while (pos < len) {
      const q = text.indexOf('"', pos);
      if (q === -1) break;
      if (q + 1 < len && text.charCodeAt(q + 1) === 34) {
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, q));
        pos = q + 2;
        segStart = pos;
        continue;
      }
      closeAt = q;
      break;
    }
    if (closeAt === -1) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as an unquoted field.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return false;
    }
    let content;
    if (parts === null) {
      content = text.slice(segStart, closeAt);
    } else {
      parts.push(text.slice(segStart, closeAt));
      content = parts.join('"');
    }
    // Every CRLF and lone CR inside quotes is one LF; count the line breaks.
    const hasCR = content.indexOf('\r') !== -1;
    if (hasCR) content = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    if (hasCR || content.indexOf('\n') !== -1) {
      let n = 0;
      let i = -1;
      while ((i = content.indexOf('\n', i + 1)) !== -1) n += 1;
      line += n;
    }
    pos = closeAt + 1;
    if (pos >= len) {
      fieldValue = content;
      fieldEnded = END;
      return true;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fieldValue = content;
      fieldEnded = COMMA;
      return true;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fieldValue = content;
      fieldEnded = LINE_BREAK;
      return true;
    }
    if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fieldValue = content;
      fieldEnded = LINE_BREAK;
      return true;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    scanUnquoted(content, true);
    return true;
  }

  // Finishes a record: drops a line that held only stray CRs, takes the header,
  // or pads/cuts the row to the first record's width and records the error.
  function finishRecord(fields, lastQuoted) {
    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a whole line with no quote and no stray CR (a trailing CR
    // right before the LF is the line's own CRLF ending). Split it natively.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? len : nl;
    const q = text.indexOf('"', pos);
    const r = text.indexOf('\r', pos);
    const crlf = lineEnd < len && lineEnd > pos && text.charCodeAt(lineEnd - 1) === 13;
    if (
      (q === -1 || q >= lineEnd) &&
      (r === -1 || r >= lineEnd || (crlf && r === lineEnd - 1))
    ) {
      finishRecord(text.slice(pos, crlf ? lineEnd - 1 : lineEnd).split(','), false);
      line += 1;
      pos = lineEnd + 1;
      continue;
    }

    // Slow path: field by field.
    const fields = [];
    let lastQuoted = false;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      if (lastQuoted) {
        if (!readQuoted()) scanUnquoted('"', false);
      } else {
        scanUnquoted('', false);
      }
      fields.push(fieldValue);
    } while (fieldEnded === COMMA);
    finishRecord(fields, lastQuoted);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
