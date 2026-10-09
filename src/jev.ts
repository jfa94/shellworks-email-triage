import { choice, noul, type TypeSafeClient } from "@typesafe-ai/sdk";
import type { Enquiry } from "./enquiry.ts";

// What Jev knows about Shellworks. Source: the Vivomer research report and shellworks.com.
export const SHELLWORKS = `About Shellworks:
- Shellworks manufactures finished rigid packaging and components end to end from its own material, Vivomer, a 100% bio-based PHA that is home-compostable and food-contact certified. It does not license the material or sell it as pellets or resin.
- Products made today: jars, dropper bottles, dropper caps and pipettes, closures and caps, perfume caps, bottles (for example a 500 ml laundry bottle), refillable containers and cups, by injection moulding, blow moulding and extrusion. It also sells a consumer cutting board. Vivomer can mimic ABS, HDPE, PP, TPE and silicone.
- Main market: personal care and cosmetics packaging.
- Temperature: stable from -20C to 120C with specific grades, so it covers freezing, freeze/thaw and hot-filling. Microwave use is not stated.
- Barrier and durability: finished parts hold liquids without a liner, resist surfactants and cosmetic oils, are stable in water and dishwasher safe, and have a shelf life over 3 years for liquids.
- Processing and finishing: runs on standard injection moulding, blow moulding and extrusion equipment with adjusted shrinkage; can be coloured with natural pigments and finished by screen printing or hot foiling.
- Certification: FDA and EU 10/2011 food contact; EN 13432 and home compostable (TUV Austria); tested for marine (ASTM D6691) and landfill (ASTM D5511) biodegradation.
- Manufacturing is in the UK, the EU and the USA.
- Catalogue formats start at 10,000 to 25,000 units.`;

// Label descriptions are what Jev reads: they carry the boundary facts about Shellworks.

export const CATEGORY = {
  buyer_direct:
    "A brand that wants finished packaging (jars, closures, caps, droppers) for its own products.",
  buyer_intermediary:
    "A contract manufacturer, filler, co-packer or adviser that wants finished packaging on behalf of brand clients.",
  licensing_request:
    "Wants to license, process, mould or buy the Shellworks material itself (pellets, resin, compounds), or to become an approved processor.",
  existing_customer:
    "An existing Shellworks customer writing about an order, delivery or production issue.",
  consumer:
    "An individual who wants to buy a Shellworks consumer product, such as the cutting board.",
  relevant_supplier:
    "Offers raw materials, compounding or manufacturing capacity that Shellworks could use to make its products.",
  vendor_solicitation:
    "Sells unrelated services to Shellworks: recruiting, marketing, freight, IP monitoring, compliance tooling and similar.",
  press_events:
    "Journalists, podcasts, conferences, and awareness campaigns or charities seeking a partner.",
  investor: "Investors or funds.",
  industry_stakeholder:
    "Retailers setting supplier requirements, trade bodies and similar organisations shaping the industry.",
  research:
    "Students, academics and research consortia, or non-buyers with technical questions about the material (for example recyclers).",
  job_seeker: "Job applications or speculative CVs.",
  out_of_scope: "Wants a product that is not among the products Shellworks makes.",
  legal_safety:
    "Safety or injury reports, legal threats, data-protection requests, or regulator inquiries.",
} as const;

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

export type Category = keyof typeof CATEGORY;
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
  hard_deadline: number;
  chasing: number;
  enough_info: number;
}

export const QUESTIONS = {
  category: choice(
    `Classify this inbound email to Shellworks.\n\n${SHELLWORKS}\n\nChoose by what the sender wants to receive from or do with Shellworks, not by the kind of company they are.`,
    CATEGORY,
  ),
  annual_volume: choice(
    "How many units per year would the sender need? Use any figure they give for their own volumes.",
    VOLUME,
  ),
  decision_timeline: choice("When does the sender intend to decide or act?", TIMELINE),
  commitment: choice("How committed is the sender, in terms of budget?", COMMITMENT),
  blocker: choice(
    `${SHELLWORKS}\n\nDoes the sender state a constraint that Shellworks may not be able to meet?`,
    BLOCKER,
  ),
  hard_deadline: noul(
    "Does the sender state a deadline, or need a reply within a few days (for example 'by Friday', 'today', 'this week')?",
    { true: "A near-term deadline is stated.", false: "No near-term deadline is stated." },
  ),
  chasing: noul("Does the sender say an earlier message of theirs went unanswered?", {
    true: "They are following up on an unanswered message.",
    false: "This is a first message.",
  }),
  enough_info: noul(
    "Does the email make clear who is writing (a named company or organisation, or an identified adviser) and what they want from Shellworks? Answer no if either is missing or too vague to act on.",
    {
      true: "The sender and their request are both clear.",
      false: "The sender or their request is missing or too vague.",
    },
  ),
} as const;

// `model` and `usage` are what Jev reports having used for the request.
export interface Classified {
  answers: Answers;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
}

export type Ask = (enquiry: Enquiry) => Promise<Classified>;

export async function askJev(client: TypeSafeClient, enquiry: Enquiry): Promise<Classified> {
  const { answers: a, model, usage } = await client.systemOne({
    state: {
      from_name: enquiry.from_name,
      from_email: enquiry.from_email,
      subject: enquiry.subject,
      body: enquiry.body,
    },
    questions: QUESTIONS,
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
      hard_deadline: a.hard_deadline.noul,
      chasing: a.chasing.noul,
      enough_info: a.enough_info.noul,
    },
  };
}
