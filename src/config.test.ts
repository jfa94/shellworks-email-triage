import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ConfigError, loadConfig, parseConfig } from "./config.ts";

const valid = () => ({
  confidence: 0.7,
  about_shellworks: ["About Shellworks:", "- Makes jars."],
  categories: {
    buyer: { label: "Buyer", description: "Wants jars.", outcome: "route:Sales" },
    vendor: { label: "Vendor", description: "Sells services.", outcome: "ignore" },
    licensing: { label: "Licensing", description: "Wants the material.", outcome: "reply:licensing" },
    press: { label: "Press", description: "Journalists.", outcome: "route: Press & Events " },
    safety: { label: "Safety", description: "Injury reports.", outcome: "escalate:Founders" },
  },
});

test("the shipped triage.config.json is valid", () => {
  const config = loadConfig();
  assert.equal(config.confidence, 0.7);
  assert.match(config.about_shellworks, /jars/);
  assert.equal(config.categories.legal_safety?.outcome.kind, "escalate");
});

test("outcomes are parsed once into their kinds, lines are joined", () => {
  const config = parseConfig(valid());
  assert.equal(config.about_shellworks, "About Shellworks:\n- Makes jars.");
  assert.deepEqual(
    Object.values(config.categories).map((c) => c.outcome),
    [
      { kind: "route", team: "Sales" },
      { kind: "ignore" },
      { kind: "reply", reply: "licensing" },
      { kind: "route", team: "Press & Events" },
      { kind: "escalate", team: "Founders" },
    ],
  );
});

test("each bad edit is rejected with the field it concerns", () => {
  const cases: [string, (c: any) => void, RegExp][] = [
    ["bar not a number", (c) => (c.confidence = "high"), /^confidence/],
    ["bar above 1", (c) => (c.confidence = 1.5), /^confidence .*1\.5/],
    ["bar of 0", (c) => (c.confidence = 0), /^confidence/],
    ["no facts", (c) => (c.about_shellworks = []), /^about_shellworks/],
    ["blank fact line", (c) => c.about_shellworks.push(" "), /^about_shellworks/],
    ["no categories", (c) => (c.categories = {}), /^categories must/],
    ["blank label", (c) => (c.categories.buyer.label = ""), /^categories\.buyer\.label/],
    ["no description", (c) => delete c.categories.buyer.description, /^categories\.buyer\.description/],
    ["unknown outcome", (c) => (c.categories.buyer.outcome = "sales"), /^categories\.buyer\.outcome .*"sales"/],
    ["unknown reply", (c) => (c.categories.licensing.outcome = "reply:nurture"), /^categories\.licensing\.outcome/],
    ["route with no team", (c) => (c.categories.press.outcome = "route: "), /^categories\.press\.outcome/],
    ["reserved team", (c) => (c.categories.press.outcome = "route:Triage Review"), /reserved/],
  ];
  for (const [name, edit, message] of cases) {
    const raw = valid();
    edit(raw);
    assert.throws(() => parseConfig(raw), (e) => e instanceof ConfigError && message.test(e.message), name);
  }
  assert.throws(() => parseConfig([]), ConfigError);
});

test("loading names the file for unreadable or malformed JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "triage-config-"));
  const bad = join(dir, "bad.json");
  writeFileSync(bad, "{ nope");
  assert.throws(() => loadConfig(bad), (e) => e instanceof ConfigError && e.message.startsWith(bad));
  assert.throws(() => loadConfig(join(dir, "missing.json")), (e) => e instanceof ConfigError && /missing\.json/.test(e.message));
});
