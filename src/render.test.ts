import assert from "node:assert/strict";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { renderDecision } from "./render.ts";
import { decide, failedDecision } from "./rules.ts";
import { answers, makeEnquiry } from "./test-support.ts";

const show = (d: Parameters<typeof renderDecision>[0]) => stripVTControlCharacters(renderDecision(d));
const decideAs = (over: Parameters<typeof answers>[0]) => decide(makeEnquiry("5"), answers(over));

test("the title names the destination for each kind of outcome", () => {
  assert.match(show(decideAs({})), /^━━ SALES ━+\n/);
  assert.match(show(decideAs({ top: "existing_customer" })), /^━━ CUSTOMER SUCCESS /);
  assert.match(show(decideAs({ top: "licensing_request" })), /^━━ AUTOMATED REPLIES /);
  assert.match(show(decideAs({ enough_info: 0.1 })), /^━━ INFORMATION REQUESTS /);
  assert.match(show(decideAs({ top: "vendor_solicitation" })), /^━━ IGNORED /);
  assert.match(show(failedDecision(makeEnquiry("7"), "timeout")), /^━━ TRIAGE REVIEW /);
});

test("the card shows id, flags, category and why", () => {
  const out = show(decideAs({ hard_deadline: 0.9 }));
  assert.match(out, /#5 {2}Sam Lee · example\.com {2}URGENT/);
  assert.match(out, /buyer_direct 0\.90 · outcome 0\.91/);
  assert.match(out, /why: Buyer/);
});

test("reply cards print the full reply text", () => {
  const d = decideAs({ top: "licensing_request" });
  assert.ok(d.outcome === "automated_reply");
  const out = show(d);
  for (const line of d.reply.text.split("\n")) assert.ok(out.includes(line), line);
});

test("a failed classification is shown as unclassified with its reason", () => {
  const out = show(failedDecision(makeEnquiry("7"), "timeout"));
  assert.match(out, /unclassified/);
  assert.match(out, /classification failed: timeout/);
});
