import type { Enquiry } from "./enquiry.ts";
import type { Answers, Category } from "./jev.ts";
import { buildReply, type Missing, type ReplyKind } from "./replies.ts";

// The single confidence knob. It gates the outcome and every probabilistic action below.
export const CONFIDENCE = 0.7;

export type Route =
  | "Customer Success"
  | "Founders"
  | "Sales"
  | "Operations"
  | "Press & Events"
  | "R&D"
  | "Triage Review";

export type Flag = "urgent" | "price_cap" | "geography" | "technical_requirement";

type Labelled = { label: string; p: number };

export interface Signals {
  category: Labelled;
  annual_volume: Labelled;
  decision_timeline: Labelled;
  commitment: Labelled;
  blocker: Labelled;
  hard_deadline: number;
  chasing: number;
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

// Categories that share a destination add their probabilities together: the outcome is
// what matters, so Jev need not separate buyer_direct from buyer_intermediary.
type Dest =
  | "sales"
  | "legal_safety"
  | "ignore"
  | `route:${Exclude<Route, "Sales" | "Triage Review">}`
  | `reply:${Exclude<ReplyKind, "nurture" | "information_request">}`;

const DESTINATION: Record<Category, Dest> = {
  buyer_direct: "sales",
  buyer_intermediary: "sales",
  licensing_request: "reply:licensing",
  existing_customer: "route:Customer Success",
  consumer: "reply:consumer",
  relevant_supplier: "route:Operations",
  vendor_solicitation: "ignore",
  press_events: "route:Press & Events",
  investor: "route:Founders",
  industry_stakeholder: "route:Founders",
  research: "route:R&D",
  job_seeker: "reply:careers",
  out_of_scope: "reply:out_of_scope",
  legal_safety: "legal_safety",
};

const CATEGORIES = Object.keys(DESTINATION) as Category[];

const fmt = (n: number) => n.toFixed(2);

function top<L extends string>(probs: Record<L, number>): Labelled & { label: L } {
  let best = { label: "" as L, p: -1 };
  for (const label of Object.keys(probs) as L[]) {
    if (probs[label] > best.p) best = { label, p: probs[label] };
  }
  return best;
}

function summarise(a: Answers): Signals {
  return {
    category: top(a.category),
    annual_volume: top(a.annual_volume),
    decision_timeline: top(a.decision_timeline),
    commitment: top(a.commitment),
    blocker: top(a.blocker),
    hard_deadline: a.hard_deadline,
    chasing: a.chasing,
    enough_info: a.enough_info,
  };
}

function flagsFor(a: Answers, urgentByDestination: boolean): Flag[] {
  const flags: Flag[] = [];
  if (urgentByDestination || a.hard_deadline >= CONFIDENCE || a.chasing >= CONFIDENCE) {
    flags.push("urgent");
  }
  for (const blocker of ["price_cap", "geography", "technical_requirement"] as const) {
    if (a.blocker[blocker] >= CONFIDENCE) flags.push(blocker);
  }
  return flags;
}

export function decide(enquiry: Enquiry, a: Answers): Decision {
  const { id, received, from_name, from_email } = enquiry;
  const signals = summarise(a);
  // A tie with any other category resolves towards safety, never away from it.
  if (CATEGORIES.every((c) => a.category.legal_safety >= a.category[c])) {
    signals.category = { label: "legal_safety", p: a.category.legal_safety };
  }
  const category = signals.category.label as Category;
  const base = {
    id,
    received,
    from_name,
    from_email,
    category,
    category_probability: signals.category.p,
    signals,
  };

  // 1. Legal and safety mail always reaches a person, whatever the confidence.
  if (category === "legal_safety") {
    return {
      ...base,
      outcome: "route",
      route: "Founders",
      outcome_confidence: signals.category.p,
      flags: flagsFor(a, true),
      why: `Safety or legal enquiry (${fmt(signals.category.p)}): always goes to Founders, urgent, and is never auto-replied.`,
    };
  }

  const sums = new Map<Dest, number>();
  for (const c of CATEGORIES) {
    const dest = DESTINATION[c];
    sums.set(dest, (sums.get(dest) ?? 0) + a.category[c]);
  }
  let [dest, confidence] = [...sums][0]!;
  for (const [d, p] of sums) if (p > confidence) [dest, confidence] = [d, p];

  // 2. Not sure enough where this goes: a person decides.
  if (confidence < CONFIDENCE) {
    return {
      ...base,
      outcome: "route",
      route: "Triage Review",
      outcome_confidence: confidence,
      flags: flagsFor(a, false),
      why: `Low confidence: best destination "${dest}" scores ${fmt(confidence)}, below the ${fmt(CONFIDENCE)} needed to act.`,
    };
  }

  const common = { ...base, outcome_confidence: confidence };

  // 3. Buyers: ask, nurture or hand to Sales.
  if (dest === "sales") {
    if (1 - a.enough_info >= CONFIDENCE) {
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
        flags: flagsFor(a, false),
        why: `Likely buyer (${fmt(confidence)}) but the sender or request is unclear (enough_info ${fmt(a.enough_info)}): asking for details.`,
      };
    }
    const tooSmall = a.annual_volume.under_10k >= CONFIDENCE;
    const tooFarOff = a.decision_timeline.beyond_year >= CONFIDENCE && a.commitment.no_budget >= CONFIDENCE;
    if (tooSmall || tooFarOff) {
      return {
        ...common,
        outcome: "automated_reply",
        reply: { kind: "nurture", text: buildReply("nurture", from_name) },
        flags: flagsFor(a, false),
        why: tooSmall
          ? `Buyer (${fmt(confidence)}), but under 10,000 units a year, below the catalogue minimum: nurture reply.`
          : `Buyer (${fmt(confidence)}), but deciding more than a year out with no budget: nurture reply.`,
      };
    }
    return {
      ...common,
      outcome: "route",
      route: "Sales",
      flags: flagsFor(a, false),
      why: `Buyer (${fmt(confidence)}) with enough detail: Sales.`,
    };
  }

  // 4. Everything else follows the destination table.
  if (dest === "ignore") {
    return {
      ...common,
      outcome: "ignore",
      flags: flagsFor(a, false),
      why: `Unsolicited vendor outreach (${fmt(confidence)}): logged, no reply.`,
    };
  }
  if (dest.startsWith("reply:")) {
    const kind = dest.slice("reply:".length) as ReplyKind;
    return {
      ...common,
      outcome: "automated_reply",
      reply: { kind, text: buildReply(kind, from_name) },
      flags: flagsFor(a, false),
      why: `${category} (${fmt(confidence)}): automated "${kind}" reply.`,
    };
  }
  const route = dest.slice("route:".length) as Route;
  return {
    ...common,
    outcome: "route",
    route,
    flags: flagsFor(a, route === "Customer Success"),
    why: `${category} (${fmt(confidence)}): ${route}.`,
  };
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
