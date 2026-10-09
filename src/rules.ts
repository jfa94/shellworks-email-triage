import type { Config, Outcome } from "./config.ts";
import type { Enquiry } from "./enquiry.ts";
import type { Answers, Category } from "./jev.ts";
import { buildReply, type Missing, type ReplyKind } from "./replies.ts";

// Teams come from triage.config.json, plus "Sales" for buyers and "Triage Review".
export type Route = string;

export type Flag = "price_cap" | "geography" | "technical_requirement";

type Labelled = { label: string; p: number };

export interface Signals {
  category: Labelled;
  annual_volume: Labelled;
  decision_timeline: Labelled;
  commitment: Labelled;
  blocker: Labelled;
  enough_info: number;
}

type Action =
  | { outcome: "route"; route: Route }
  | { outcome: "information_request" | "automated_reply"; reply: { kind: ReplyKind; text: string } }
  | { outcome: "ignore" };

export type Decision = Action & {
  id: string;
  received: string;
  from_name: string;
  from_email: string;
  category: Category | null;
  category_probability: number | null;
  outcome_confidence: number | null;
  signals: Signals | null;
  flags: Flag[];
  why: string;
  error?: string;
};

const fmt = (n: number) => n.toFixed(2);

// Categories whose outcomes are equal share one destination and add their probabilities together:
// the outcome is what matters, so Jev need not separate buyer_direct from buyer_intermediary.
const destination = (o: Outcome) =>
  o.kind === "reply" ? `reply:${o.reply}` : o.kind === "route" || o.kind === "escalate" ? `${o.kind}:${o.team}` : o.kind;

function top<L extends string>(probs: Record<L, number>): Labelled & { label: L } {
  let best = { label: "" as L, p: -1 };
  for (const label of Object.keys(probs) as L[]) {
    if (probs[label] > best.p) best = { label, p: probs[label] };
  }
  return best;
}

function flagsFor(config: Config, a: Answers): Flag[] {
  return (["price_cap", "geography", "technical_requirement"] as const).filter((b) => a.blocker[b] >= config.confidence);
}

export function decide(config: Config, enquiry: Enquiry, a: Answers): Decision {
  const { id, received, from_name, from_email } = enquiry;
  const outcomeOf = (c: Category) => config.categories[c]!.outcome;
  const ids = Object.keys(config.categories);

  // Most likely category; a tie with an escalate category resolves towards it, never away from it.
  let category = ids[0]!;
  for (const c of ids) {
    const p = a.category[c] ?? 0;
    const best = a.category[category] ?? 0;
    if (p > best || (p === best && outcomeOf(c).kind === "escalate" && outcomeOf(category).kind !== "escalate")) {
      category = c;
    }
  }
  const signals: Signals = {
    category: { label: category, p: a.category[category] ?? 0 },
    annual_volume: top(a.annual_volume),
    decision_timeline: top(a.decision_timeline),
    commitment: top(a.commitment),
    blocker: top(a.blocker),
    enough_info: a.enough_info,
  };
  const base = {
    id,
    received,
    from_name,
    from_email,
    category,
    category_probability: signals.category.p,
    signals,
    flags: flagsFor(config, a),
  };
  const label = config.categories[category]!.label;

  // 1. Escalate (legal and safety) always reaches a person, whatever the confidence.
  const own = outcomeOf(category);
  if (own.kind === "escalate") {
    return {
      ...base,
      outcome: "route",
      route: own.team,
      outcome_confidence: signals.category.p,
      why: `${label} (${fmt(signals.category.p)}): always goes to ${own.team} and is never auto-replied.`,
    };
  }

  const sums = new Map<string, { outcome: Outcome; p: number }>();
  for (const c of ids) {
    const key = destination(outcomeOf(c));
    const prev = sums.get(key);
    sums.set(key, { outcome: outcomeOf(c), p: (prev?.p ?? 0) + (a.category[c] ?? 0) });
  }
  let [dest, best] = [...sums][0]!;
  for (const [d, s] of sums) if (s.p > best.p) [dest, best] = [d, s];
  const confidence = best.p;

  // 2. Not sure enough where this goes: a person decides.
  if (confidence < config.confidence) {
    return {
      ...base,
      outcome: "route",
      route: "Triage Review",
      outcome_confidence: confidence,
      why: `Low confidence: best destination "${dest}" scores ${fmt(confidence)}, below the ${fmt(config.confidence)} needed to act.`,
    };
  }

  const common = { ...base, outcome_confidence: confidence };
  const outcome = best.outcome;

  // 3. Buyers: ask, nurture or hand to Sales.
  if (outcome.kind === "buyer") {
    if (1 - a.enough_info >= config.confidence) {
      const missing = (
        [
          ["volume", signals.annual_volume],
          ["timeline", signals.decision_timeline],
          ["budget", signals.commitment],
        ] as const
      )
        .filter(([, s]) => s.label === "unstated")
        .map(([m]) => m satisfies Missing);
      return {
        ...common,
        outcome: "information_request",
        reply: { kind: "information_request", text: buildReply("information_request", from_name, missing) },
        why: `Likely buyer (${fmt(confidence)}) but the sender or request is unclear (enough_info ${fmt(a.enough_info)}): asking for details.`,
      };
    }
    const tooSmall = a.annual_volume.under_10k >= config.confidence;
    const tooFarOff = a.decision_timeline.beyond_year >= config.confidence && a.commitment.no_budget >= config.confidence;
    if (tooSmall || tooFarOff) {
      return {
        ...common,
        outcome: "automated_reply",
        reply: { kind: "nurture", text: buildReply("nurture", from_name) },
        why: tooSmall
          ? `Buyer (${fmt(confidence)}), but under 10,000 units a year, below the catalogue minimum: nurture reply.`
          : `Buyer (${fmt(confidence)}), but deciding more than a year out with no budget: nurture reply.`,
      };
    }
    return { ...common, outcome: "route", route: "Sales", why: `Buyer (${fmt(confidence)}) with enough detail: Sales.` };
  }

  // 4. Everything else does what its category's outcome says.
  switch (outcome.kind) {
    case "ignore":
      return { ...common, outcome: "ignore", why: `${label} (${fmt(confidence)}): logged, no reply.` };
    case "reply":
      return {
        ...common,
        outcome: "automated_reply",
        reply: { kind: outcome.reply, text: buildReply(outcome.reply, from_name) },
        why: `${label} (${fmt(confidence)}): automated "${outcome.reply}" reply.`,
      };
    case "route":
    case "escalate":
      return { ...common, outcome: "route", route: outcome.team, why: `${label} (${fmt(confidence)}): ${outcome.team}.` };
  }
}

export function failedDecision(enquiry: Enquiry, message: string): Decision {
  const { id, received, from_name, from_email } = enquiry;
  return {
    id,
    received,
    from_name,
    from_email,
    outcome: "route",
    route: "Triage Review",
    category: null,
    category_probability: null,
    outcome_confidence: null,
    signals: null,
    flags: [],
    why: `classification failed: ${message}`,
    error: message,
  };
}
