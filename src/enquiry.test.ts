import assert from "node:assert/strict";
import { test } from "node:test";
import fc from "fast-check";
import { EnquiryError, parseEnquiry } from "./enquiry.ts";

const valid = { id: "1", received: "2026-09-01", from_name: "Sam", from_email: "s@x.com", subject: "Hi", body: "Hello" };

test("a valid object parses to exactly the six fields", () => {
  assert.deepEqual(parseEnquiry({ ...valid, extra: 1 }), valid);
});

test("empty strings are accepted", () => {
  assert.deepEqual(parseEnquiry({ ...valid, from_name: "", body: "" }), { ...valid, from_name: "", body: "" });
});

test("non-objects are rejected", () => {
  for (const v of [null, [], "x", 3, undefined]) assert.throws(() => parseEnquiry(v), EnquiryError);
});

test("missing and non-string fields are all named", () => {
  const { id: _id, ...noId } = valid;
  assert.throws(() => parseEnquiry(noId), /field\(s\): id$/);
  assert.throws(() => parseEnquiry({ ...valid, id: 7, body: null }), /field\(s\): id, body$/);
});

test("property: any six strings plus arbitrary extra keys parse back to the six", () => {
  fc.assert(
    fc.property(fc.array(fc.string(), { minLength: 6, maxLength: 6 }), fc.dictionary(fc.string(), fc.anything()), (s, extra) => {
      const [id, received, from_name, from_email, subject, body] = s as [string, string, string, string, string, string];
      const six = { id, received, from_name, from_email, subject, body };
      assert.deepEqual(parseEnquiry({ ...extra, ...six }), six);
    }),
  );
});
