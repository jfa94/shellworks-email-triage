import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import type { Answers, Category } from "./jev.ts";
import { AUTOMATED_LINE } from "./replies.ts";
import { CONFIDENCE, decide, failedDecision } from "./rules.ts";
import {
  answers,
  BLOCKERS,
  CATEGORIES,
  COMMITMENTS,
  dist,
  makeEnquiry,
  only,
  TIMELINES,
  VOLUMES,
} from "./test-support.ts";

const enquiry = makeEnquiry();

test("each category goes where the table says", () => {
  const expected: [Category, string][] = [
    ["buyer_direct", "route:Sales"],
    ["buyer_intermediary", "route:Sales"],
    ["licensing_request", "automated_reply:licensing"],
    ["existing_customer", "route:Customer Success"],
    ["consumer", "automated_reply:consumer"],
    ["relevant_supplier", "route:Operations"],
    ["vendor_solicitation", "ignore"],
    ["press_events", "route:Press & Events"],
    ["investor", "route:Founders"],
    ["industry_stakeholder", "route:Founders"],
    ["research", "route:R&D"],
    ["job_seeker", "automated_reply:careers"],
    ["out_of_scope", "automated_reply:out_of_scope"],
    ["legal_safety", "route:Founders"],
  ];
  assert.equal(expected.length, CATEGORIES.length);
  for (const [top, want] of expected) {
    const d = decide(enquiry, answers({ top }));
    const got =
      d.outcome === "route" ? `route:${d.route}` : d.outcome === "automated_reply" ? `automated_reply:${d.reply.kind}` : d.outcome;
    assert.equal(got, want, top);
  }
});

test("categories sharing a destination add up", () => {
  const d = decide(enquiry, answers({ category: only({ buyer_direct: 0.5, buyer_intermediary: 0.4, vendor_solicitation: 0.1 }) }));
  assert.equal(d.outcome === "route" && d.route, "Sales");
  assert.ok(d.outcome_confidence! >= CONFIDENCE);
});

test("probability spread across different destinations goes to Triage Review", () => {
  const d = decide(enquiry, answers({ category: only({ buyer_direct: 0.4, press_events: 0.3, research: 0.3 }) }));
  assert.equal(d.outcome === "route" && d.route, "Triage Review");
  assert.match(d.why, /Low confidence/);
});

test("legal_safety reaches Founders as urgent even at low confidence", () => {
  const d = decide(enquiry, answers({ top: "legal_safety", p: 0.3 }));
  assert.equal(d.outcome === "route" && d.route, "Founders");
  assert.ok(d.flags.includes("urgent"));
});

test("a tie between legal_safety and another category resolves to legal_safety", () => {
  const d = decide(enquiry, answers({ category: only({ buyer_direct: 0.5, legal_safety: 0.5 }) }));
  assert.equal(d.category, "legal_safety");
  assert.equal(d.outcome === "route" && d.route, "Founders");
});

test("buyer below the catalogue minimum gets the nurture reply", () => {
  const d = decide(enquiry, answers({ annual_volume: dist(VOLUMES, "under_10k", 0.9) }));
  assert.equal(d.outcome, "automated_reply");
  assert.equal(d.outcome === "automated_reply" && d.reply.kind, "nurture");
});

test("nurture also needs both: more than a year out AND no budget", () => {
  const farOff = dist(TIMELINES, "beyond_year", 0.9);
  const both = decide(enquiry, answers({ decision_timeline: farOff, commitment: dist(COMMITMENTS, "no_budget", 0.9) }));
  assert.equal(both.outcome, "automated_reply");
  const onlyFar = decide(enquiry, answers({ decision_timeline: farOff }));
  assert.equal(onlyFar.outcome === "route" && onlyFar.route, "Sales");
  const onlyNoBudget = decide(enquiry, answers({ commitment: dist(COMMITMENTS, "no_budget", 0.9) }));
  assert.equal(onlyNoBudget.outcome === "route" && onlyNoBudget.route, "Sales");
});

test("information request beats nurture and asks only for what is unstated", () => {
  const d = decide(
    enquiry,
    answers({
      enough_info: 0.1,
      annual_volume: dist(VOLUMES, "unstated", 0.9),
      commitment: dist(COMMITMENTS, "unstated", 0.9),
    }),
  );
  assert.equal(d.outcome, "information_request");
  if (d.outcome !== "information_request") return;
  assert.match(d.reply.text, /units a year/);
  assert.match(d.reply.text, /budget/);
  assert.doesNotMatch(d.reply.text, /decision/);
});

test("information request is only for buyers; a thin vendor pitch is still ignored", () => {
  const d = decide(enquiry, answers({ top: "vendor_solicitation", enough_info: 0.05 }));
  assert.equal(d.outcome, "ignore");
});

test("unsure about enough_info (between 0.3 and 0.7) goes to Sales", () => {
  const d = decide(enquiry, answers({ enough_info: 0.5 }));
  assert.equal(d.outcome === "route" && d.route, "Sales");
});

test("flags: urgency from deadline, chasing and Customer Success; blockers from probability", () => {
  assert.ok(decide(enquiry, answers({ top: "press_events", hard_deadline: 0.8 })).flags.includes("urgent"));
  assert.ok(decide(enquiry, answers({ chasing: 0.8 })).flags.includes("urgent"));
  assert.ok(decide(enquiry, answers({ top: "existing_customer" })).flags.includes("urgent"));
  assert.deepEqual(decide(enquiry, answers({ top: "press_events" })).flags, []);
  const priced = decide(enquiry, answers({ blocker: dist(BLOCKERS, "price_cap", 0.9) }));
  assert.deepEqual(priced.flags, ["price_cap"]);
  const unsure = decide(enquiry, answers({ blocker: dist(BLOCKERS, "price_cap", 0.5) }));
  assert.deepEqual(unsure.flags, []);
});

test("a failed classification is a Triage Review decision carrying the error", () => {
  const d = failedDecision(enquiry, "timeout");
  assert.equal(d.outcome === "route" && d.route, "Triage Review");
  assert.equal(d.error, "timeout");
  assert.equal(d.signals, null);
  assert.match(d.why, /classification failed: timeout/);
});

// Properties over arbitrary, normalised Jev answers.
const normalised = <L extends string>(labels: readonly L[]) =>
  fc
    .array(fc.double({ min: 0.001, max: 1, noNaN: true }), { minLength: labels.length, maxLength: labels.length })
    .map((ws) => {
      const sum = ws.reduce((a, b) => a + b, 0);
      return Object.fromEntries(labels.map((l, i) => [l, ws[i]! / sum])) as Record<L, number>;
    });
const prob = fc.double({ min: 0, max: 1, noNaN: true });
const anyAnswers: fc.Arbitrary<Answers> = fc.record({
  category: normalised(CATEGORIES),
  annual_volume: normalised(VOLUMES),
  decision_timeline: normalised(TIMELINES),
  commitment: normalised(COMMITMENTS),
  blocker: normalised(BLOCKERS),
  hard_deadline: prob,
  chasing: prob,
  enough_info: prob,
});

test("property: every input yields exactly one well-formed outcome", () => {
  fc.assert(
    fc.property(anyAnswers, (a) => {
      const d = decide(enquiry, a);
      assert.equal("route" in d, d.outcome === "route");
      assert.equal("reply" in d, d.outcome === "information_request" || d.outcome === "automated_reply");
      if ("reply" in d) assert.ok(d.reply.text.startsWith(AUTOMATED_LINE));
      assert.ok(d.why.length > 0);
    }),
  );
});

test("property: legal_safety is never auto-replied or ignored", () => {
  fc.assert(
    fc.property(anyAnswers, (a) => {
      const d = decide(enquiry, a);
      const topIsLegal = CATEGORIES.every((c) => a.category.legal_safety >= a.category[c]);
      if (topIsLegal) {
        assert.equal(d.outcome === "route" && d.route, "Founders");
        assert.ok(d.flags.includes("urgent"));
      }
    }),
  );
});

test("property: replies and ignores only happen at or above the confidence bar", () => {
  fc.assert(
    fc.property(anyAnswers, (a) => {
      const d = decide(enquiry, a);
      if (d.outcome !== "route") assert.ok(d.outcome_confidence! >= CONFIDENCE);
      if (d.outcome === "route" && d.route === "Triage Review") assert.ok(d.outcome_confidence! < CONFIDENCE);
    }),
  );
});

test("property: information requests are only for buyers, ignores only for vendors", () => {
  fc.assert(
    fc.property(anyAnswers, (a) => {
      const d = decide(enquiry, a);
      if (d.outcome === "information_request") {
        assert.ok(a.category.buyer_direct + a.category.buyer_intermediary >= CONFIDENCE);
      }
      if (d.outcome === "ignore") assert.equal(d.category, "vendor_solicitation");
    }),
  );
});
