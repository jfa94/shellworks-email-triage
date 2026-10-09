import { styleText } from "node:util";
import type { Decision, Route } from "./rules.ts";

const WIDTH = 64;

type Section = Route | "Information Requests" | "Automated Replies" | "Ignored";

function sectionOf(d: Decision): Section {
  switch (d.outcome) {
    case "route":
      return d.route;
    case "information_request":
      return "Information Requests";
    case "automated_reply":
      return "Automated Replies";
    case "ignore":
      return "Ignored";
  }
}

const domain = (email: string) => email.split("@").at(-1) ?? email;

function card(d: Decision): string[] {
  const flags = d.flags.map((f) => (f === "urgent" ? styleText(["red", "bold"], "URGENT") : styleText("yellow", f)));
  const head = [styleText("bold", `#${d.id}`), `${d.from_name || "(no name)"} · ${domain(d.from_email)}`, ...flags];
  const lines = [` ${head.join("  ")}`];

  if (d.signals) {
    const s = d.signals;
    const known = [
      ["volume", s.annual_volume.label],
      ["decision", s.decision_timeline.label],
      ["commitment", s.commitment.label],
    ]
      .filter(([, label]) => label !== "unstated")
      .map(([name, label]) => `${name} ${label}`);
    if (s.blocker.label !== "none") known.push(`blocker ${s.blocker.label}`);
    lines.push(`     ${d.category} ${d.category_probability!.toFixed(2)} · outcome ${d.outcome_confidence!.toFixed(2)}`);
    if (known.length > 0) lines.push(`     ${known.join(" · ")}`);
  } else {
    lines.push(`     ${styleText("red", "unclassified")}`);
  }
  lines.push(styleText("dim", `     why: ${d.why}`));

  if ("reply" in d) {
    lines.push(styleText("dim", `     ┌─ reply (${d.reply.kind}) ─`));
    for (const line of d.reply.text.split("\n")) lines.push(styleText("dim", `     │ ${line}`));
    lines.push(styleText("dim", "     └─"));
  }
  return lines;
}

export function renderDecision(d: Decision): string {
  const title = `━━ ${sectionOf(d).toUpperCase()} `;
  return [styleText("cyan", title + "━".repeat(Math.max(3, WIDTH - title.length))), ...card(d)].join("\n");
}
