import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { parseCsv } from "./csv.ts";

test("plain rows, with and without a trailing newline", () => {
  assert.deepEqual(parseCsv("a,b\n1,2\n"), [["a", "b"], ["1", "2"]]);
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("quoted fields keep commas, newlines and escaped quotes", () => {
  assert.deepEqual(parseCsv('1,"Hi,\nthere ""you""",x\n'), [["1", 'Hi,\nthere "you"', "x"]]);
});

test("CRLF line endings", () => {
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [["a", "b"], ["1", "2"]]);
});

test("empty fields are kept and blank lines are skipped", () => {
  assert.deepEqual(parseCsv("a,,\n\n,\"\",c\n"), [["a", "", ""], ["", "", "c"]]);
});

test("an unterminated quote throws", () => {
  assert.throws(() => parseCsv('a,"b\n'), /unterminated/);
});

test("property: always-quoted encoding round-trips", () => {
  const quote = (s: string) => `"${s.replaceAll('"', '""')}"`;
  fc.assert(
    fc.property(fc.array(fc.array(fc.string(), { minLength: 1, maxLength: 5 }), { maxLength: 8 }), (rows) => {
      const text = rows.map((r) => r.map(quote).join(",")).join("\n");
      assert.deepEqual(parseCsv(text), rows);
    }),
  );
});
