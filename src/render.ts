import { styleText } from "node:util";
import type { Enquiry } from "./enquiry.ts";
import { SALES, type Config } from "./config.ts";
import type { Classified, Commitment, Timeline, Volume } from "./jev.ts";
import type { Decision, Flag } from "./rules.ts";

// Used when stdout is not a terminal (pipes, tests).
const FALLBACK_WIDTH = 64;
const INDENT = 11; // two spaces plus a 9-wide label column
const BODY_LINES = 2;

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

const CHECK_LABEL: Record<Flag, string> = {
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

function excerpt(body: string, cardWidth: number): string[] {
  const width = Math.max(10, cardWidth - INDENT);
  const scan = cardWidth * (BODY_LINES + 1);
  const lines = wrap(body.slice(0, scan), width);
  if (lines.length <= BODY_LINES && body.length <= scan) return lines;
  const kept = lines.slice(0, BODY_LINES);
  const last = kept.pop() ?? "";
  return [...kept, `${last.length >= width ? last.slice(0, width - 1) : last}…`];
}

function typeLine(config: Config, d: Decision): string {
  if (!d.signals || !d.category) return "not classified";
  const category = config.categories[d.category]!;
  const sure = `${category.label} · ${percent(d.outcome_confidence!)} sure`;
  if (category.outcome.kind === "escalate") return `${sure}, always goes to ${category.outcome.team}`;
  const lowConfidence = d.outcome === "route" && d.route === "Triage Review";
  return lowConfidence ? `${sure}, acts at ${percent(config.confidence)}` : sure;
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

export function renderCard(
  config: Config,
  enquiry: Enquiry,
  d: Decision,
  classified: Classified | null,
  width = process.stdout.columns || FALLBACK_WIDTH,
): string {
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
  rows.push(styleText("cyan", head + "━".repeat(Math.max(3, width - head.length))));

  row("From", `${enquiry.from_name || "(no name)"} <${enquiry.from_email}>`);
  row("Subject", enquiry.subject || "(none)");
  const body = excerpt(enquiry.body, width);
  if (body.length > 0) row("Body", body);
  row("Type", typeLine(config, d));

  const outcome = d.category ? config.categories[d.category]!.outcome : null;
  if (d.signals && outcome?.kind === "route" && outcome.team === SALES) {
    const s = d.signals;
    row("Buyer", [VOLUME_LABEL[s.annual_volume.label as Volume], TIMELINE_LABEL[s.decision_timeline.label as Timeline], COMMITMENT_LABEL[s.commitment.label as Commitment]].join(" · "));
  }
  const checks = d.flags.map((f) => CHECK_LABEL[f]);
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
