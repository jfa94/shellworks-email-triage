import type { Enquiry } from "./enquiry.ts";
import { BLOCKER, CATEGORY, COMMITMENT, TIMELINE, VOLUME, type Answers, type Category } from "./jev.ts";

export const makeEnquiry = (id = "1"): Enquiry => ({
  id,
  received: "2026-09-01",
  from_name: "Sam Lee",
  from_email: "sam@example.com",
  subject: "s",
  body: "b",
});

export const CATEGORIES = Object.keys(CATEGORY) as Category[];
export const VOLUMES = Object.keys(VOLUME) as (keyof typeof VOLUME)[];
export const TIMELINES = Object.keys(TIMELINE) as (keyof typeof TIMELINE)[];
export const COMMITMENTS = Object.keys(COMMITMENT) as (keyof typeof COMMITMENT)[];
export const BLOCKERS = Object.keys(BLOCKER) as (keyof typeof BLOCKER)[];

// A distribution putting `p` on `top` and splitting the remainder evenly.
export function dist<L extends string>(labels: readonly L[], top: L, p: number): Record<L, number> {
  const rest = (1 - p) / (labels.length - 1);
  return Object.fromEntries(labels.map((l) => [l, l === top ? p : rest])) as Record<L, number>;
}

// A category distribution with the given masses and zero everywhere else.
export const only = (masses: Partial<Record<Category, number>>) =>
  Object.fromEntries(CATEGORIES.map((c) => [c, masses[c] ?? 0])) as Record<Category, number>;

// A confident, fully specified buyer with nothing unusual: lands in Sales.
export function answers(over: Partial<Answers> & { top?: Category; p?: number } = {}): Answers {
  const { top = "buyer_direct", p = 0.9, ...rest } = over;
  return {
    category: dist(CATEGORIES, top, p),
    annual_volume: dist(VOLUMES, "150k_1m", 0.9),
    decision_timeline: dist(TIMELINES, "this_quarter", 0.9),
    commitment: dist(COMMITMENTS, "funded_project", 0.9),
    blocker: dist(BLOCKERS, "none", 0.9),
    hard_deadline: 0.05,
    chasing: 0.05,
    enough_info: 0.95,
    ...rest,
  };
}
