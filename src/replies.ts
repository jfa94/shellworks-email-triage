export type ReplyKind =
  | "licensing"
  | "consumer"
  | "careers"
  | "out_of_scope"
  | "nurture"
  | "information_request";

// What an Information Request may still ask for, beyond company and application.
export type Missing = "volume" | "timeline" | "budget";

export const AUTOMATED_LINE = "This is an automated reply from Shellworks.";

const SHOP = "https://www.shellworks.com/shop";
const CAREERS = "https://shellworks.teamtailor.com/";
const FAQ = "https://www.shellworks.com/faq";
const CONTACT = "https://www.shellworks.com/contact";

const ASK: Record<Missing, string> = {
  volume: "roughly how many units a year you would need",
  timeline: "when you are looking to make a decision",
  budget: "whether a budget is in place",
};

export function firstName(fromName: string): string {
  return fromName.trim().split(/\s+/)[0] || "there";
}

function body(kind: ReplyKind, missing: Missing[]): string {
  switch (kind) {
    case "licensing":
      return [
        "Thank you for getting in touch. Shellworks manufactures finished packaging end to end, so we do not license our material or supply it to other manufacturers.",
        "If you are looking for finished components for your clients, reply with a few details about what they need and the volumes involved.",
      ].join("\n\n");
    case "consumer":
      return `Thank you for your interest in our products. Our consumer products, and their current availability, are listed at ${SHOP}`;
    case "careers":
      return `Thank you for your interest in working with us. Current openings, and how to apply, are listed at ${CAREERS}`;
    case "out_of_scope":
      return "Thank you for getting in touch. Shellworks makes compostable packaging for brands, and we do not make the product you are asking about, so we are not able to help with this one.";
    case "nurture":
      return [
        "Thank you for getting in touch. Based on what you have shared, we may not be the right fit just yet: our catalogue formats start at 10,000 to 25,000 units.",
        `Our FAQ is at ${FAQ} and you can find news and updates at ${CONTACT}`,
        "We would love to hear from you when you are ready.",
      ].join("\n\n");
    case "information_request": {
      const asks = [
        "which company you are contacting us from",
        "what you would like to use the packaging for (product and format)",
        ...missing.map((m) => ASK[m]),
      ];
      return [
        "Thank you for getting in touch. So we can send your enquiry to the right person, could you tell us:",
        asks.map((a) => `  • ${a}`).join("\n"),
        "A member of the team will follow up.",
      ].join("\n\n");
    }
  }
}

export function buildReply(kind: ReplyKind, fromName: string, missing: Missing[] = []): string {
  return [AUTOMATED_LINE, `Hi ${firstName(fromName)},`, body(kind, missing), "— Shellworks"].join("\n\n");
}
