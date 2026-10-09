import { createServer as createHttpServer, type Server } from "node:http";
import { parseArgs, styleText } from "node:util";
import { APIConnectionError, InternalServerError, RateLimitError, TypeSafeClient } from "@typesafe-ai/sdk";
import { EnquiryError, parseEnquiry, type Enquiry } from "./enquiry.ts";
import { askJev, type Ask, type Classified } from "./jev.ts";
import { renderCard } from "./render.ts";
import { decide, failedDecision, type Decision } from "./rules.ts";

const USAGE = "Usage: triage [--port N]";
const MAX_BODY = 1_000_000;

// Transient failures send that one enquiry to a person; anything else (bad key, bad request,
// unexpected response) is systemic and is rethrown rather than hidden as a routing outcome.
const isTransient = (err: unknown) =>
  err instanceof APIConnectionError || err instanceof RateLimitError || err instanceof InternalServerError;

export async function triageOne(
  enquiry: Enquiry,
  ask: Ask,
): Promise<{ decision: Decision; classified: Classified | null }> {
  try {
    const classified = await ask(enquiry);
    return { decision: decide(enquiry, classified.answers), classified };
  } catch (err) {
    if (!isTransient(err)) throw err;
    const decision = failedDecision(enquiry, err instanceof Error ? err.message : String(err));
    return { decision, classified: null };
  }
}

async function readBody(req: AsyncIterable<Buffer | string>): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BODY) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// The response says whether the enquiry was triaged, never where it went: the result is printed.
export function createServer(ask: Ask, print: (line: string) => void = console.log): Server {
  // ponytail: one enquiry at a time keeps cards from interleaving; a queue is the upgrade.
  let tail: Promise<unknown> = Promise.resolve();

  return createHttpServer(async (req, res) => {
    const reply = (status: number, text?: string) => {
      res.writeHead(status, text === undefined ? {} : { "content-type": "text/plain" });
      res.end(text);
    };

    if (req.url !== "/enquiries") return reply(404, "not found\n");
    if (req.method !== "POST") return reply(405, "use POST\n");

    const raw = await readBody(req);
    if (raw === null) return reply(413, "body too large\n");

    let enquiry: Enquiry;
    try {
      enquiry = parseEnquiry(JSON.parse(raw));
    } catch (err) {
      if (err instanceof SyntaxError) return reply(400, "body is not valid JSON\n");
      if (err instanceof EnquiryError) return reply(400, `${err.message}\n`);
      throw err;
    }

    const turn = tail.then(async () => {
      print(styleText("dim", `asking Jev about #${enquiry.id}…`));
      try {
        const { decision, classified } = await triageOne(enquiry, ask);
        print(renderCard(enquiry, decision, classified) + "\n");
        return 204;
      } catch (err) {
        print(styleText("red", `  ✖ Jev error: ${err instanceof Error ? err.message : String(err)}\n`));
        return 502;
      }
    });
    tail = turn;
    const status = await turn;
    reply(status, status === 502 ? "classification failed\n" : undefined);
  });
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { port: { type: "string", default: "3000" } },
  });
  const port = Number(values.port);
  if (positionals.length > 0 || !Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(USAGE);
    return 1;
  }
  if (!process.env.TYPESAFE_API_KEY?.trim()) {
    throw new Error("TYPESAFE_API_KEY is not set; add it to .env");
  }

  const client = new TypeSafeClient();
  const server = createServer((enquiry) => askJev(client, enquiry));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  console.log(`Listening on http://127.0.0.1:${port}  POST /enquiries`);
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
