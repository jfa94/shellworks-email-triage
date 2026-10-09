import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import fc from "fast-check";
import { CONFIG_PATH, parseConfig, type Config } from "./config.ts";
import type { Answers, Category } from "./jev.ts";
import { AUTOMATED_LINE } from "./replies.ts";
import { decide, failedDecision } from "./rules.ts";
import {
  answers,
  BLOCKERS,
  CATEGORIES,
  COMMITMENTS,
  CONFIG,
  dist,
  makeEnquiry,
  only,
  TIMELINES,
  VOLUMES,
} from "./test-support.ts";

const enquiry = makeEnquiry();
const run = (a: Answers, config: Config = CONFIG) => decide(config, enquiry, a);
const where = (d: ReturnType<typeof run>) =>
  d.outcome === "route" ? `route:${d.route}` : d.outcome === "automated_reply" ? `automated_reply:${d.reply.kind}` : d.outcome;
const kindOf = (c: Category) => CONFIG.categories[c]!.outcome.kind;
const isSales = (c: Category) => {
  const o = CONFIG.categories[c]!.outcome;
  return o.kind === "route" && o.team === "Sales";
};

// The shipped config with one category's outcome changed, as an edit to triage.config.json would.
function edited(category: Category, outcome: string): Config {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  raw.categories[category].outcome = outcome;
  return parseConfig(raw);
}

test("each category goes where the shipped config says", () => {
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
  for (const [top, want] of expected) assert.equal(where(run(answers({ top }))), want, top);
});

test("editing a category's outcome in the config changes where it goes, with no code change", () => {
  const licensing = answers({ top: "licensing_request" });
  assert.equal(where(run(licensing, edited("licensing_request", "route:Founders"))), "route:Founders");
  const escalated = edited("licensing_request", "escalate:Founders");
  assert.equal(where(run(answers({ top: "licensing_request", p: 0.3 }), escalated)), "route:Founders");
});

test("any category routed to Sales gets the buyer rules first", () => {
  const config = edited("press_events", "route:Sales");
  const small = answers({ top: "press_events", annual_volume: dist(VOLUMES, "under_10k", 0.9) });
  assert.equal(where(run(small, config)), "automated_reply:nurture");
  assert.equal(where(run(answers({ top: "press_events" }), config)), "route:Sales");
});

test("a category added to the config is classified and routed", () => {
  const config = parseConfig({
    confidence: 0.7,
    about_shellworks: ["Shellworks makes jars."],
    categories: {
      buyer: { label: "Buyer", description: "Wants jars.", outcome: "route:Sales" },
      partner: { label: "Partner", description: "Wants to co-develop.", outcome: "route:Partnerships" },
    },
  });
  const d = decide(config, enquiry, answers({ category: { buyer: 0.1, partner: 0.9 } }));
  assert.equal(where(d), "route:Partnerships");
});

test("categories sharing a destination add up", () => {
  const d = run(answers({ category: only({ buyer_direct: 0.5, buyer_intermediary: 0.4, vendor_solicitation: 0.1 }) }));
  assert.equal(d.outcome === "route" && d.route, "Sales");
  assert.ok(d.outcome_confidence! >= CONFIG.confidence);
});

test("probability spread across different destinations goes to Triage Review", () => {
  const d = run(answers({ category: only({ buyer_direct: 0.4, press_events: 0.3, research: 0.3 }) }));
  assert.equal(d.outcome === "route" && d.route, "Triage Review");
  assert.match(d.why, /Low confidence/);
});

test("legal_safety reaches Founders even at low confidence", () => {
  const d = run(answers({ top: "legal_safety", p: 0.3 }));
  assert.equal(d.outcome === "route" && d.route, "Founders");
  assert.match(d.why, /never auto-replied/);
});

test("a tie between legal_safety and another category resolves to legal_safety", () => {
  const d = run(answers({ category: only({ buyer_direct: 0.5, legal_safety: 0.5 }) }));
  assert.equal(d.category, "legal_safety");
  assert.equal(d.outcome === "route" && d.route, "Founders");
});

test("buyer below the catalogue minimum gets the nurture reply", () => {
  const d = run(answers({ annual_volume: dist(VOLUMES, "under_10k", 0.9) }));
  assert.equal(d.outcome, "automated_reply");
  assert.equal(d.outcome === "automated_reply" && d.reply.kind, "nurture");
});

test("nurture also needs both: more than a year out AND no budget", () => {
  const farOff = dist(TIMELINES, "beyond_year", 0.9);
  const both = run(answers({ decision_timeline: farOff, commitment: dist(COMMITMENTS, "no_budget", 0.9) }));
  assert.equal(both.outcome, "automated_reply");
  const onlyFar = run(answers({ decision_timeline: farOff }));
  assert.equal(onlyFar.outcome === "route" && onlyFar.route, "Sales");
  const onlyNoBudget = run(answers({ commitment: dist(COMMITMENTS, "no_budget", 0.9) }));
  assert.equal(onlyNoBudget.outcome === "route" && onlyNoBudget.route, "Sales");
});

test("information request beats nurture and asks only for what is unstated", () => {
  const d = run(
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
  const d = run(answers({ top: "vendor_solicitation", enough_info: 0.05 }));
  assert.equal(d.outcome, "ignore");
});

test("unsure about enough_info (between 0.3 and 0.7) goes to Sales", () => {
  const d = run(answers({ enough_info: 0.5 }));
  assert.equal(d.outcome === "route" && d.route, "Sales");
});

test("blocker flags come from probability and never change the outcome", () => {
  const priced = run(answers({ blocker: dist(BLOCKERS, "price_cap", 0.9) }));
  assert.deepEqual(priced.flags, ["price_cap"]);
  assert.equal(where(priced), "route:Sales");
  assert.deepEqual(run(answers({ blocker: dist(BLOCKERS, "price_cap", 0.5) })).flags, []);
  assert.deepEqual(run(answers({ top: "press_events" })).flags, []);
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
const anyAnswers: fc.Arbitrary<Answers> = fc.record({
  category: normalised(CATEGORIES),
  annual_volume: normalised(VOLUMES),
  decision_timeline: normalised(TIMELINES),
  commitment: normalised(COMMITMENTS),
  blocker: normalised(BLOCKERS),
  enough_info: fc.double({ min: 0, max: 1, noNaN: true }),
});
const salesMass = (a: Answers) =>
  CATEGORIES.filter(isSales).reduce((sum, c) => sum + a.category[c]!, 0);

test("property: every input yields exactly one well-formed outcome", () => {
  fc.assert(
    fc.property(anyAnswers, (a) => {
      const d = run(a);
      assert.equal("route" in d, d.outcome === "route");
      assert.equal("reply" in d, d.outcome === "information_request" || d.outcome === "automated_reply");
      if ("reply" in d) assert.ok(d.reply.text.startsWith(AUTOMATED_LINE));
      assert.ok(d.why.length > 0);
    }),
  );
});

test("property: an escalate category on top is never auto-replied or ignored", () => {
  fc.assert(
    fc.property(anyAnswers, (a) => {
      const d = run(a);
      const topIsLegal = CATEGORIES.every((c) => a.category.legal_safety! >= a.category[c]!);
      if (topIsLegal) assert.equal(d.outcome === "route" && d.route, "Founders");
    }),
  );
});

test("property: replies and ignores only happen at or above the confidence bar", () => {
  fc.assert(
    fc.property(anyAnswers, (a) => {
      const d = run(a);
      if (d.outcome !== "route") assert.ok(d.outcome_confidence! >= CONFIG.confidence);
      if (d.outcome === "route" && d.route === "Triage Review") assert.ok(d.outcome_confidence! < CONFIG.confidence);
    }),
  );
});

test("property: information requests are only for buyers, ignores only for ignore categories", () => {
  fc.assert(
    fc.property(anyAnswers, (a) => {
      const d = run(a);
      if (d.outcome === "information_request") assert.ok(salesMass(a) >= CONFIG.confidence);
      if (d.outcome === "ignore") assert.equal(kindOf(d.category!), "ignore");
    }),
  );
});
