import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CATEGORY_REPLIES, type CategoryReply } from "./replies.ts";

// The team whose routes are qualified by the buyer rules (information request, nurture) before Sales.
export const SALES = "Sales";

// What a category leads to. "escalate" acts at any confidence.
export type Outcome =
  | { kind: "ignore" }
  | { kind: "reply"; reply: CategoryReply }
  | { kind: "route" | "escalate"; team: string };

export interface CategoryConfig {
  label: string;
  description: string;
  outcome: Outcome;
}

export interface Config {
  confidence: number;
  about_shellworks: string;
  categories: Record<string, CategoryConfig>;
}

export class ConfigError extends Error {}

export const CONFIG_PATH = fileURLToPath(new URL("../triage.config.json", import.meta.url));

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

function parseOutcome(field: string, value: unknown): Outcome {
  if (value === "ignore") return { kind: "ignore" };
  const m = typeof value === "string" ? /^(reply|route|escalate):(.+)$/.exec(value) : null;
  const arg = m?.[2]!.trim();
  if (m?.[1] === "reply" && CATEGORY_REPLIES.includes(arg as CategoryReply)) {
    return { kind: "reply", reply: arg as CategoryReply };
  }
  if ((m?.[1] === "route" || m?.[1] === "escalate") && arg && arg !== "Triage Review") {
    return { kind: m[1], team: arg };
  }
  throw new ConfigError(
    `${field} must be "ignore", "reply:<${CATEGORY_REPLIES.join("|")}>", "route:<Team>" or "escalate:<Team>" (Triage Review is reserved); got ${JSON.stringify(value)}`,
  );
}

export function parseConfig(value: unknown): Config {
  if (!isRecord(value)) throw new ConfigError("config must be a JSON object");
  const { confidence, about_shellworks, categories } = value;
  if (typeof confidence !== "number" || !(confidence > 0 && confidence <= 1)) {
    throw new ConfigError(`confidence must be a number above 0 and at most 1; got ${JSON.stringify(confidence)}`);
  }
  if (!Array.isArray(about_shellworks) || about_shellworks.length === 0 || !about_shellworks.every(isText)) {
    throw new ConfigError("about_shellworks must be a non-empty list of non-empty lines");
  }
  if (!isRecord(categories) || Object.keys(categories).length === 0) {
    throw new ConfigError("categories must be an object with at least one category");
  }
  const parsed: Record<string, CategoryConfig> = {};
  for (const [id, c] of Object.entries(categories)) {
    const at = `categories.${id}`;
    if (!isText(id)) throw new ConfigError("category ids must be non-empty");
    if (!isRecord(c)) throw new ConfigError(`${at} must be an object`);
    if (!isText(c.label)) throw new ConfigError(`${at}.label must be a non-empty string`);
    if (!isText(c.description)) throw new ConfigError(`${at}.description must be a non-empty string`);
    parsed[id] = { label: c.label, description: c.description, outcome: parseOutcome(`${at}.outcome`, c.outcome) };
  }
  return { confidence, about_shellworks: about_shellworks.join("\n"), categories: parsed };
}

export function loadConfig(path = CONFIG_PATH): Config {
  try {
    return parseConfig(JSON.parse(readFileSync(path, "utf8")));
  } catch (err) {
    throw new ConfigError(`${path}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
