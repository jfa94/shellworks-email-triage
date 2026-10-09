import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import { APIConnectionError, APIError, AuthenticationError } from "@typesafe-ai/sdk";
import { createServer, triageOne } from "./cli.ts";
import type { Ask } from "./jev.ts";
import { answers, CONFIG, makeEnquiry } from "./test-support.ts";

const ok: Ask = async () => ({ answers: answers(), model: "jev-test", usage: { input_tokens: 120, output_tokens: 8 } });
const failWith = (err: Error): Ask => async () => {
  throw err;
};
const body = { id: "7", received: "2026-09-01", from_name: "Sam Lee", from_email: "sam@example.com", subject: "Jars", body: "Hi" };

test("triageOne returns the decision and what Jev used", async () => {
  const { decision, classified } = await triageOne(CONFIG, makeEnquiry("1"), ok);
  assert.equal(decision.outcome === "route" && decision.route, "Sales");
  assert.equal(classified?.usage.input_tokens, 120);
});

test("a transient failure becomes a Triage Review decision with no usage", async () => {
  for (const err of [new APIConnectionError("offline"), APIError.fromResponse(429, null, new Headers()), APIError.fromResponse(503, null, new Headers())]) {
    const { decision, classified } = await triageOne(CONFIG, makeEnquiry("1"), failWith(err));
    assert.equal(decision.outcome === "route" && decision.route, "Triage Review");
    assert.match(decision.why, /classification failed/);
    assert.equal(classified, null);
  }
});

test("systemic failures are rethrown instead of routed", async () => {
  const auth = APIError.fromResponse(401, null, new Headers());
  assert.ok(auth instanceof AuthenticationError);
  for (const err of [auth, APIError.fromResponse(400, null, new Headers()), new TypeError("unexpected response")]) {
    await assert.rejects(triageOne(CONFIG, makeEnquiry("1"), failWith(err)), (e) => e === err);
  }
});

// Starts the server on a free port, runs `fn`, and always closes it.
async function withServer(ask: Ask, fn: (url: string, lines: string[]) => Promise<void>) {
  const lines: string[] = [];
  const server = createServer(CONFIG, ask, (l) => lines.push(stripVTControlCharacters(l)));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}/enquiries`, lines);
  } finally {
    server.close();
    server.closeAllConnections();
  }
}

const post = (url: string, payload: unknown) =>
  fetch(url, { method: "POST", body: typeof payload === "string" ? payload : JSON.stringify(payload) });

test("a valid POST is triaged, answered 204 and printed with its token usage", async () => {
  await withServer(ok, async (url, lines) => {
    const res = await post(url, body);
    assert.equal(res.status, 204);
    const out = lines.join("\n");
    assert.match(out, /━━ #7 · 2026-09-01 /);
    assert.match(out, /Subject {2}Jars/);
    assert.match(out, /Outcome {2}SALES/);
    assert.match(out, /128 tokens · jev-test/);
  });
});

test("bad requests are rejected without calling Jev", async () => {
  let calls = 0;
  const ask: Ask = async (e) => (calls++, ok(e));
  await withServer(ask, async (url) => {
    assert.equal((await post(url, "{nope")).status, 400);
    const missing = await post(url, { ...body, id: undefined });
    assert.equal(missing.status, 400);
    assert.match(await missing.text(), /field\(s\): id/);
    assert.equal((await fetch(url)).status, 405);
    assert.equal((await post(url.replace("enquiries", "other"), body)).status, 404);
    assert.equal((await post(url, "x".repeat(1_000_001))).status, 413);
    assert.equal(calls, 0);
  });
});

test("a transient Jev failure is 204 and shown as Triage Review", async () => {
  await withServer(failWith(new APIConnectionError("offline")), async (url, lines) => {
    assert.equal((await post(url, body)).status, 204);
    assert.match(lines.join("\n"), /Outcome {2}TRIAGE REVIEW/);
  });
});

test("a systemic Jev failure is 502, printed, and the server keeps serving", async () => {
  let first = true;
  const ask: Ask = async (e) => {
    if (first) {
      first = false;
      throw APIError.fromResponse(401, null, new Headers());
    }
    return ok(e);
  };
  await withServer(ask, async (url, lines) => {
    assert.equal((await post(url, body)).status, 502);
    assert.match(lines.join("\n"), /✖ Jev error/);
    assert.equal((await post(url, { ...body, id: "8" })).status, 204);
  });
});

test("concurrent requests print one whole card at a time", async () => {
  const slow: Ask = async (e) => {
    await new Promise((r) => setTimeout(r, 20));
    return ok(e);
  };
  await withServer(slow, async (url, lines) => {
    await Promise.all([post(url, body), post(url, { ...body, id: "8" })]);
    const heads = lines.map((l, i) => (l.startsWith("asking Jev about #") ? i : -1)).filter((i) => i >= 0);
    const tokens = lines.map((l, i) => (l.includes(" tokens · ") ? i : -1)).filter((i) => i >= 0);
    assert.equal(heads.length, 2);
    assert.ok(tokens[0]! < heads[1]!, "first card finishes before the second starts");
  });
});
