import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import fc from "fast-check";
import type { Classified } from "./jev.ts";
import { renderCard } from "./render.ts";
import { decide, failedDecision } from "./rules.ts";
import { answers, BLOCKERS, dist, makeEnquiry, VOLUMES } from "./test-support.ts";

const classified: Classified = { answers: answers(), model: "jev-test", usage: { input_tokens: 2287, output_tokens: 452 } };
const enquiry = { ...makeEnquiry("5"), received: "19/08/2026", subject: "Caps", body: "We need 90,000 caps." };

const show = (over: Parameters<typeof answers>[0], e = enquiry) =>
  stripVTControlCharacters(renderCard(e, decide(e, answers(over)), classified));
const lines = (out: string) => out.split("\n");

test("the card shows what came in and what was decided", () => {
  const out = show({});
  assert.match(out, /^━━ #5 · 19\/08\/2026 ━+\n/);
  assert.match(out, /^ {2}From {5}Sam Lee <sam@example\.com>$/m);
  assert.match(out, /^ {2}Subject {2}Caps$/m);
  assert.match(out, /^ {2}Body {5}We need 90,000 caps\.$/m);
  assert.match(out, /^ {2}Type {5}Buyer \(direct\) · 90% sure$/m);
  assert.match(out, /^ {2}Outcome {2}SALES$/m);
  assert.doesNotMatch(out, /why:|buyer_direct/);
});

test("Outcome is the last labelled row, followed only by the token footer", () => {
  const l = lines(show({}));
  assert.match(l.at(-2)!, /^ {2}Outcome /);
  assert.equal(l.at(-1), "  2,739 tokens · jev-test");
});

test("long bodies are cut to two lines with an ellipsis", () => {
  const out = show({}, { ...enquiry, body: "word ".repeat(200) });
  const body = lines(out).filter((l) => /^ {2}Body |^ {11}word/.test(l));
  assert.equal(body.length, 2);
  assert.ok(body[1]!.endsWith("…"));
  assert.ok(body.every((l) => l.length <= 64));
});

test("an empty body has no Body row and an empty name is labelled", () => {
  const out = show({}, { ...enquiry, body: "", from_name: "" });
  assert.doesNotMatch(out, /Body/);
  assert.match(out, /From {5}\(no name\) <sam@example\.com>/);
});

test("any body renders within the card width", () => {
  fc.assert(
    fc.property(fc.string(), (body) => {
      const out = show({}, { ...enquiry, body });
      assert.ok(lines(out).every((l) => l.length <= 64));
    }),
  );
});

test("the bar is mentioned only when low confidence sends it to Triage Review", () => {
  const low = show({ p: 0.5 });
  assert.match(low, /Type {5}Buyer \(direct\) · 53% sure, acts at 70%/);
  assert.match(low, /Outcome {2}TRIAGE REVIEW/);
  assert.doesNotMatch(show({}), /acts at/);
});

test("legal and safety always says where it goes, whatever the confidence", () => {
  const out = show({ top: "legal_safety", p: 0.4 });
  assert.match(out, /Type {5}Legal & safety · 40% sure, always goes to Founders/);
  assert.match(out, /Urgent {3}always for legal & safety/);
  assert.match(out, /Outcome {2}FOUNDERS/);
});

test("the Buyer row appears for buyers only and shows unstated signals", () => {
  assert.match(show({}), /Buyer {4}150k–1M\/yr · deciding this quarter · funded project/);
  assert.match(show({ annual_volume: dist(VOLUMES, "unstated", 0.9) }), /Buyer {4}volume not stated ·/);
  assert.doesNotMatch(show({ top: "existing_customer" }), /Buyer {4}/);
});

test("urgent states why", () => {
  assert.match(show({ hard_deadline: 0.9 }), /Urgent {3}deadline$/m);
  assert.match(show({ chasing: 0.9 }), /Urgent {3}chasing$/m);
  assert.match(show({ hard_deadline: 0.9, chasing: 0.9 }), /Urgent {3}deadline, chasing$/m);
  assert.match(show({ top: "existing_customer" }), /Urgent {3}always for Customer Success$/m);
  assert.doesNotMatch(show({}), /Urgent/);
});

test("blockers are listed as plain checks", () => {
  assert.match(show({ blocker: dist(BLOCKERS, "price_cap", 0.9) }), /Check {4}price cap$/m);
  assert.match(show({ blocker: dist(BLOCKERS, "technical_requirement", 0.9) }), /Check {4}technical requirement$/m);
  assert.doesNotMatch(show({}), /Check/);
});

test("the outcome row names each kind of outcome", () => {
  assert.match(show({ top: "existing_customer" }), /Outcome {2}CUSTOMER SUCCESS/);
  assert.match(show({ top: "licensing_request" }), /Outcome {2}AUTOMATED REPLY \(licensing\)/);
  assert.match(show({ enough_info: 0.1 }), /Outcome {2}INFORMATION REQUEST/);
  assert.match(show({ top: "vendor_solicitation" }), /Outcome {2}IGNORE/);
});

test("reply cards print the full reply text", () => {
  const d = decide(enquiry, answers({ top: "licensing_request" }));
  assert.ok(d.outcome === "automated_reply");
  const out = stripVTControlCharacters(renderCard(enquiry, d, classified));
  for (const line of d.reply.text.split("\n")) assert.ok(out.includes(line), line);
});

test("a failed classification shows its error, no signals and no tokens", () => {
  const out = stripVTControlCharacters(renderCard(enquiry, failedDecision(enquiry, "timeout"), null));
  assert.match(out, /Type {5}not classified/);
  assert.match(out, /Error {4}timeout/);
  assert.match(out, /Outcome {2}TRIAGE REVIEW/);
  assert.match(out, /no Jev tokens used/);
  assert.doesNotMatch(out, /Buyer {4}|Urgent/);
});
