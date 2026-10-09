export interface Enquiry {
  id: string;
  received: string;
  from_name: string;
  from_email: string;
  subject: string;
  body: string;
}

export class EnquiryError extends Error {}

const FIELDS = ["id", "received", "from_name", "from_email", "subject", "body"] as const;

// Validates an untrusted request body; extra fields are dropped, empty strings are allowed.
export function parseEnquiry(value: unknown): Enquiry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new EnquiryError("body must be a JSON object");
  }
  const record = value as Record<string, unknown>;
  const bad = FIELDS.filter((name) => typeof record[name] !== "string");
  if (bad.length > 0) throw new EnquiryError(`missing or non-string field(s): ${bad.join(", ")}`);
  return Object.fromEntries(FIELDS.map((name) => [name, record[name]])) as unknown as Enquiry;
}
