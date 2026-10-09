import assert from "node:assert/strict";
import { test } from "node:test";
import { QUESTIONS, SHELLWORKS } from "./jev.ts";

test("category and blocker questions carry the Shellworks product facts", () => {
  assert.match(SHELLWORKS, /jars/);
  for (const name of ["category", "blocker"] as const) {
    assert.ok(String(QUESTIONS[name].instructions).includes(SHELLWORKS), name);
  }
});
