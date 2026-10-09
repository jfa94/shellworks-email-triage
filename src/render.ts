import { styleText } from "node:util";
import type { Enquiry } from "./enquiry.ts";
import type { Category, Classified, Commitment, Timeline, Volume } from "./jev.ts";
import { CONFIDENCE, type Decision, type Flag } from "./rules.ts";

const WIDTH = 64;
const INDENT = 11; // two spaces plus a 9-wide label column
const BODY_LINES = 2;
const BODY_SCAN = 400;

const CATEGORY_LABEL: Record<Category, string> = {
  buyer_direct: "Buyer (direct)",
  buyer_intermediary: "Buyer (intermediary)",
  licensing_request: "Licensing request",
  existing_customer: "Existing customer",
  consumer: "Consumer",
  relevant_supplier: "Supplier",
  vendor_solicitation: "Vendor solicitation",
  press_events: "Press & events",
  investor: "Investor",
  industry_stakeholder: "Industry stakeholder",
  research: "Research",
  job_seeker: "Job seeker",
  out_of_scope: "Out of scope",
  legal_safety: "Legal & safety",
};

const VOLUME_LABEL: Record<Volume, string> = {
  under_10k: "under 10k/yr",
  "10k_150k": "10k–150k/yr",
  "150k_1m": "150k–1M/yr",
  over_1m: "over 1M/yr",
  unstated: "volume not stated",
};

const TIMELINE_LABEL: Record<Timeline, string> = {
  this_month: "deciding this month",
  this_quarter: "deciding this quarter",
  within_year: "deciding within a year",
  beyond_year: "deciding more than a year out",
  unstated: "timeline not stated",
};

const COMMITMENT_LABEL: Record<Commitment, string> = {
  budget_approved: "budget approved",
  funded_project: "funded project",
  exploring: "exploring",
  no_budget: "no budget",
  unstated: "budget not stated",
};

const CHECK_LABEL: Record<Exclude<Flag, "urgent">, string> = {
  price_cap: "price cap",
  geography: "region",
  technical_requirement: "technical requirement",
};

// Never rounds up to the bar: 69.6% reads as 69, not 70.
const percent = (p: number) => `${Math.floor(p * 100)}%`;

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (let word of text.split(/\s+/).filter(Boolean)) {
    for (; word.length > width; word = word.slice(width)) {
      if (cur) lines.push(cur);
      cur = "";
      lines.push(word.slice(0, width));
    }
    if (cur && cur.length + 1 + word.length > width) {
      lines.push(cur);
      cur = word;
    } else {
      cur = cur ? `${cur} ${word}` : word;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function excerpt(body: string): string[] {
  const width = WIDTH - INDENT;
  const lines = wrap(body.slice(0, BODY_SCAN), width);
  if (lines.length <= BODY_LINES && body.length <= BODY_SCAN) return lines;
  const kept = lines.slice(0, BODY_LINES);
  const last = kept.pop() ?? "";
  return [...kept, `${last.length >= width ? last.slice(0, width - 1) : last}…`];
}

// Mirrors flagsFor in rules.ts: destination reasons first, then what Jev read in the text.
function urgentReason(d: Decision): string | null {
  if (!d.flags.includes("urgent")) return null;
  if (d.category === "legal_safety") return "always for legal & safety";
  if (d.outcome === "route" && d.route === "Customer Success") return "always for Customer Success";
  const s = d.signals;
  const reasons = [s && s.hard_deadline >= CONFIDENCE && "deadline", s && s.chasing >= CONFIDENCE && "chasing"];
  return reasons.filter(Boolean).join(", ");
}

function typeLine(d: Decision): string {
  if (!d.signals || !d.category) return "not classified";
  const sure = `${CATEGORY_LABEL[d.category]} · ${percent(d.outcome_confidence!)} sure`;
  if (d.category === "legal_safety") return `${sure}, always goes to Founders`;
  const lowConfidence = d.outcome === "route" && d.route === "Triage Review";
  return lowConfidence ? `${sure}, acts at ${percent(CONFIDENCE)}` : sure;
}

function outcomeLine(d: Decision): string {
  switch (d.outcome) {
    case "route":
      return d.route.toUpperCase();
    case "information_request":
      return "INFORMATION REQUEST";
    case "automated_reply":
      return `AUTOMATED REPLY (${d.reply.kind})`;
    case "ignore":
      return "IGNORE";
  }
}

export function renderCard(enquiry: Enquiry, d: Decision, classified: Classified | null): string {
  const rows: string[] = [];
  const row = (label: string, value: string | string[], style?: Parameters<typeof styleText>[0]) => {
    const [first = "", ...rest] = Array.isArray(value) ? value : [value];
    const lines = [first, ...rest.map((l) => " ".repeat(INDENT - 2) + l)];
    for (const [i, line] of lines.entries()) {
      const text = `  ${i === 0 ? label.padEnd(INDENT - 2) : ""}${line}`.trimEnd();
      rows.push(style ? styleText(style, text) : text);
    }
  };

  const head = `━━ #${d.id} · ${d.received} `;
  rows.push(styleText("cyan", head + "━".repeat(Math.max(3, WIDTH - head.length))));

  row("From", `${enquiry.from_name || "(no name)"} <${enquiry.from_email}>`);
  row("Subject", enquiry.subject || "(none)");
  const body = excerpt(enquiry.body);
  if (body.length > 0) row("Body", body);
  row("Type", typeLine(d));

  const urgent = urgentReason(d);
  if (urgent !== null) row("Urgent", urgent, ["red", "bold"]);
  if (d.signals && (d.category === "buyer_direct" || d.category === "buyer_intermediary")) {
    const s = d.signals;
    row("Buyer", [VOLUME_LABEL[s.annual_volume.label as Volume], TIMELINE_LABEL[s.decision_timeline.label as Timeline], COMMITMENT_LABEL[s.commitment.label as Commitment]].join(" · "));
  }
  const checks = d.flags.filter((f): f is Exclude<Flag, "urgent"> => f !== "urgent").map((f) => CHECK_LABEL[f]);
  if (checks.length > 0) row("Check", checks.join(", "), "yellow");
  if (d.error) row("Error", d.error, "red");
  if ("reply" in d) row("Reply", d.reply.text.split("\n"), "dim");

  row("Outcome", outcomeLine(d), "bold");
  const footer = classified
    ? `${(classified.usage.input_tokens + classified.usage.output_tokens).toLocaleString("en-GB")} tokens · ${classified.model}`
    : "no Jev tokens used";
  rows.push(styleText("dim", `  ${footer}`));
  return rows.join("\n");
}
