import { choice, noul, type TypeSafeClient } from "@typesafe-ai/sdk";
import type { Config } from "./config.ts";
import type { Enquiry } from "./enquiry.ts";

export const VOLUME = {
  under_10k: "Fewer than 10,000 units per year.",
  "10k_150k": "10,000 to 150,000 units per year.",
  "150k_1m": "150,000 to 1,000,000 units per year.",
  over_1m: "More than 1,000,000 units per year.",
  unstated: "No annual volume can be inferred.",
} as const;

export const TIMELINE = {
  this_month: "Deciding or acting within the next month.",
  this_quarter: "Deciding or acting within about three months.",
  within_year: "Deciding or acting within about a year.",
  beyond_year: "Deciding or acting more than a year from now.",
  unstated: "No decision timeline is given.",
} as const;

export const COMMITMENT = {
  budget_approved: "Budget is signed off or approved.",
  funded_project: "A funded, active project, without explicit budget approval.",
  exploring: "Early exploration with no commitment stated.",
  no_budget: "Explicitly no budget or no immediate plan.",
  unstated: "Nothing is said about budget or commitment.",
} as const;

export const BLOCKER = {
  price_cap: "States a price ceiling or cost constraint that may be hard to meet.",
  geography: "Needs supply or service in a region that may not be covered.",
  technical_requirement:
    "States a technical requirement the packaging must meet (heat, cold, barrier, wear, filling line).",
  none: "No constraint is stated.",
} as const;

// Category ids and their descriptions come from triage.config.json; these labels stay in code
// because the buyer rules refer to them by name.
export type Category = string;
export type Volume = keyof typeof VOLUME;
export type Timeline = keyof typeof TIMELINE;
export type Commitment = keyof typeof COMMITMENT;
export type Blocker = keyof typeof BLOCKER;

type Probs<L extends string> = Record<L, number>;

// Probabilities only: the rules weigh them, and it is all the decision needs.
export interface Answers {
  category: Probs<Category>;
  annual_volume: Probs<Volume>;
  decision_timeline: Probs<Timeline>;
  commitment: Probs<Commitment>;
  blocker: Probs<Blocker>;
  enough_info: number;
}

export function questions(config: Config) {
  const categories = Object.fromEntries(Object.entries(config.categories).map(([id, c]) => [id, c.description]));
  return {
    category: choice(
      `Classify this inbound email to Shellworks.\n\n${config.about_shellworks}\n\nChoose by what the sender wants to receive from or do with Shellworks, not by the kind of company they are.`,
      categories,
    ),
    annual_volume: choice(
      "How many units per year would the sender need? Use any figure they give for their own volumes.",
      VOLUME,
    ),
    decision_timeline: choice("When does the sender intend to decide or act?", TIMELINE),
    commitment: choice("How committed is the sender, in terms of budget?", COMMITMENT),
    blocker: choice(
      `${config.about_shellworks}\n\nDoes the sender state a constraint that Shellworks may not be able to meet?`,
      BLOCKER,
    ),
    enough_info: noul(
      "Does the email make clear who is writing (a named company or organisation, or an identified adviser) and what they want from Shellworks? Answer no if either is missing or too vague to act on.",
      {
        true: "The sender and their request are both clear.",
        false: "The sender or their request is missing or too vague.",
      },
    ),
  };
}

// `model` and `usage` are what Jev reports having used for the request.
export interface Classified {
  answers: Answers;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export type Ask = (enquiry: Enquiry) => Promise<Classified>;

export async function askJev(client: TypeSafeClient, config: Config, enquiry: Enquiry): Promise<Classified> {
  const { answers: a, model, usage } = await client.systemOne({
    state: {
      from_name: enquiry.from_name,
      from_email: enquiry.from_email,
      subject: enquiry.subject,
      body: enquiry.body,
    },
    questions: questions(config),
  });
  return {
    model,
    usage,
    answers: {
      category: a.category.probabilities,
      annual_volume: a.annual_volume.probabilities,
      decision_timeline: a.decision_timeline.probabilities,
      commitment: a.commitment.probabilities,
      blocker: a.blocker.probabilities,
      enough_info: a.enough_info.noul,
    },
  };
}
