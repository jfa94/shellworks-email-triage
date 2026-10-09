import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { stripVTControlCharacters } from "node:util";
import type { Enquiry } from "./enquiry.ts";
import { loadEnquiries, renderList, send } from "./send.ts";

const mk = (id: number): Enquiry => ({
  id: String(id),
  received: "19/08/2026",
  from_name: `Name ${id}`,
  from_email: `n${id}@x.com`,
  subject: `Subject ${id}`,
  body: "b",
});
const rows = Array.from({ length: 20 }, (_, i) => mk(i + 1));
const plain = (lines: string[]) => lines.map(stripVTControlCharacters);

test("the viewport follows the cursor and stays inside the list", () => {
  const first = (cursor: number) => plain(renderList(rows, new Map(), cursor, 5, 40))[0];
  assert.match(first(0)!, /^#1 /);
  assert.match(first(10)!, /^#9 /);
  assert.match(first(19)!, /^#16 /);
  assert.equal(renderList(rows.slice(0, 2), new Map(), 1, 5, 40).length, 4);
});

test("each enquiry gets a one-line body preview under it, cut with an ellipsis", () => {
  const long = { ...mk(1), body: `Hi there,\n\n${"word ".repeat(30)}` };
  const [title, body, next] = plain(renderList([long, mk(2)], new Map(), 0, 2, 30));
  assert.match(title!, /^#1 /);
  assert.equal(body!.length, 30);
  assert.match(body!, /^ {2}Hi there, word word .*…$/);
  assert.match(next!, /^#2 /);
  assert.equal(plain(renderList([mk(2)], new Map(), 0, 1, 30))[1], "  b");
});

test("status is right-aligned and the left text is truncated to fit", () => {
  const [line] = plain(renderList(rows, new Map([[0, "sent"]]), 0, 1, 30));
  assert.equal(line!.length, 30);
  assert.match(line!, /^#1 {2}Name 1 {2}Subject 1\s+\[sent\]$/);
  const [narrow] = plain(renderList(rows, new Map([[0, "sent"]]), 0, 1, 16));
  assert.equal(narrow!.length, 16);
  assert.match(narrow!, /…\s\[sent\]$/);
});

test("only the cursor row is inverted", () => {
  const lines = renderList(rows, new Map(), 0, 2, 30);
  assert.notEqual(lines[0], plain(lines)[0]);
  assert.equal(lines[2], plain(lines)[2]);
});

test("loadEnquiries maps header columns and names the bad row", () => {
  const csv = 'id,received,from_name,from_email,subject,body\n1,d,N,n@x.com,S,"two\nlines"\n';
  assert.deepEqual(loadEnquiries(csv), [{ id: "1", received: "d", from_name: "N", from_email: "n@x.com", subject: "S", body: "two\nlines" }]);
  assert.throws(() => loadEnquiries("id,received\n1,d\n"), /row 2: .*from_name/);
  assert.throws(() => loadEnquiries("id,received,from_name,from_email,subject,body\n"), /no rows/);
});

async function withServer(status: number, fn: (url: string, bodies: string[]) => Promise<void>) {
  const bodies: string[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    bodies.push(body);
    res.writeHead(status).end(status === 204 ? undefined : "nope\n");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}/enquiries`, bodies);
  } finally {
    server.close();
  }
}

test("send POSTs exactly the six-field JSON and reports 'sent' on 204", async () => {
  await withServer(204, async (url, bodies) => {
    assert.equal(await send(url, rows[0]!), "sent");
    assert.deepEqual(JSON.parse(bodies[0]!), rows[0]);
  });
});

test("send reports the server's rejection", async () => {
  await withServer(400, async (url) => {
    assert.equal(await send(url, rows[0]!), "failed 400: nope");
  });
});

test("send reports a connection failure instead of throwing", async () => {
  let dead = "";
  await withServer(204, async (url) => void (dead = url));
  assert.match(await send(dead, rows[0]!), /^failed: /);
});
