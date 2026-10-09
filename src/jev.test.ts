import assert from "node:assert/strict";
import { test } from "node:test";
import { questions } from "./jev.ts";
import { CONFIG } from "./test-support.ts";

test("category and blocker questions carry the Shellworks product facts from the config", () => {
  const q = questions(CONFIG);
  for (const name of ["category", "blocker"] as const) {
    assert.ok(String(q[name].instructions).includes(CONFIG.about_shellworks), name);
  }
});

test("Jev reads each configured category's description", () => {
  const q = questions(CONFIG);
  for (const [id, c] of Object.entries(CONFIG.categories)) assert.equal(q.category.criteria[id], c.description, id);
});
