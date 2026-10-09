// RFC 4180: quoted fields may hold commas, newlines and "" escapes. Blank lines are skipped.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false; // the current row has content, so a newline ends a real row

  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (quoted) {
      if (c !== '"') field += c;
      else if (text.charAt(i + 1) === '"') (field += '"', i++);
      else quoted = false;
    } else if (c === '"') {
      quoted = started = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
      started = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text.charAt(i + 1) === "\n") i++;
      if (started) rows.push([...row, field]);
      row = [];
      field = "";
      started = false;
    } else {
      field += c;
      started = true;
    }
  }
  if (quoted) throw new Error("unterminated quoted field");
  if (started) rows.push([...row, field]);
  return rows;
}
