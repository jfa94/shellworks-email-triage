import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { AUTOMATED_LINE, buildReply, firstName, type Missing, type ReplyKind } from "./replies.ts";

const KINDS: ReplyKind[] = ["licensing", "consumer", "careers", "out_of_scope", "nurture", "information_request"];
const MISSING: Missing[] = ["volume", "timeline", "budget"];
const bullets = (text: string) => text.split("\n").filter((l) => l.startsWith("  • "));

test("every reply opens with the automated line", () => {
  fc.assert(
    fc.property(fc.constantFrom(...KINDS), fc.string(), (kind, name) => {
      assert.ok(buildReply(kind, name).startsWith(`${AUTOMATED_LINE}\n\n`));
    }),
  );
});

test("greets by first name, or 'there' when the name is blank", () => {
  assert.equal(firstName("Maren Voss"), "Maren");
  assert.equal(firstName("  Dr  Ingrid Solberg"), "Dr");
  assert.equal(firstName(""), "there");
  assert.equal(firstName("   "), "there");
  assert.match(buildReply("careers", ""), /\n\nHi there,\n\n/);
});

test("information request always asks company and application, plus exactly the missing signals", () => {
  fc.assert(
    fc.property(fc.subarray(MISSING), (missing) => {
      const asks = bullets(buildReply("information_request", "Sam", missing));
      assert.equal(asks.length, 2 + missing.length);
      assert.ok(asks[0]!.includes("company"));
      assert.ok(asks[1]!.includes("product and format"));
      assert.equal(asks.some((a) => a.includes("units a year")), missing.includes("volume"));
      assert.equal(asks.some((a) => a.includes("decision")), missing.includes("timeline"));
      assert.equal(asks.some((a) => a.includes("budget")), missing.includes("budget"));
    }),
  );
});

test("only information requests contain bullets", () => {
  for (const kind of KINDS.filter((k) => k !== "information_request")) {
    assert.deepEqual(bullets(buildReply(kind, "Sam", MISSING)), []);
  }
});

test("licensing reply states the end-to-end model; nurture cites the published minimum", () => {
  assert.match(buildReply("licensing", "Sam"), /end to end/);
  assert.match(buildReply("nurture", "Sam"), /10,000 to 25,000 units/);
});
