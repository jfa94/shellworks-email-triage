import { readFileSync } from "node:fs";
import { emitKeypressEvents, type Key } from "node:readline";
import { parseArgs, styleText } from "node:util";
import { parseCsv } from "./csv.ts";
import { EnquiryError, parseEnquiry, type Enquiry } from "./enquiry.ts";

const USAGE = "Usage: send [--url URL]";
const DEFAULT_URL = "http://127.0.0.1:3000/enquiries";
const INBOX = new URL("../data/inbox.csv", import.meta.url);

// Every row is validated up front so a bad CSV fails at startup, not on the Nth Enter.
export function loadEnquiries(text: string): Enquiry[] {
  const [header, ...rows] = parseCsv(text);
  if (!header || rows.length === 0) throw new Error("CSV has no rows");
  return rows.map((cells, i) => {
    try {
      return parseEnquiry(Object.fromEntries(header.map((name, j) => [name, cells[j]])));
    } catch (err) {
      if (err instanceof EnquiryError) throw new Error(`row ${i + 2}: ${err.message}`);
      throw err;
    }
  });
}

// Resolves to the row's status label; never rejects, so a failure shows up in the list.
export async function send(url: string, enquiry: Enquiry): Promise<string> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(enquiry),
    });
    return res.status === 204 ? "sent" : `failed ${res.status}: ${(await res.text()).trim()}`;
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause : err;
    return `failed: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

const fit = (s: string, width: number) =>
  s.length > width ? `${s.slice(0, Math.max(0, width - 1))}…` : s;

const flat = (s: string) => s.replace(/\s+/g, " ");

// Two lines per visible enquiry (`count` of them): the cursor row inverted with the status
// right-aligned, then a dim one-line body preview.
export function renderList(
  enquiries: readonly Enquiry[],
  statuses: ReadonlyMap<number, string>,
  cursor: number,
  count: number,
  width: number,
): string[] {
  const top = Math.max(0, Math.min(cursor - Math.floor(count / 2), enquiries.length - count));
  return enquiries.slice(top, top + count).flatMap((e, k) => {
    const i = top + k;
    const status = statuses.get(i);
    const text = fit(status ? `[${status}]` : "", Math.floor(width / 2));
    const color = status === "sent" ? "green" : status?.startsWith("failed") ? "red" : "yellow";
    const room = width - text.length - 1;
    const left = fit(`#${e.id}  ${flat(e.from_name)}  ${flat(e.subject)}`, room).padEnd(room);
    const line = `${left} ${text && styleText(color, text)}`;
    // Forced on: inverse is the only cursor marker, so NO_COLOR must not hide it.
    return [
      i === cursor ? styleText("inverse", line, { validateStream: false }) : line,
      styleText("dim", fit(`  ${flat(e.body).trim()}`, width)),
    ];
  });
}

function run(enquiries: readonly Enquiry[], url: string): void {
  const { stdin, stdout } = process;
  const statuses = new Map<number, string>();
  const last = enquiries.length - 1;
  let cursor = 0;

  const visibleRows = () => Math.max(1, Math.floor(((stdout.rows ?? 24) - 2) / 2));
  const draw = () => {
    const width = (stdout.columns ?? 80) - 1;
    const sent = [...statuses.values()].filter((s) => s === "sent").length;
    const header = styleText("bold", fit(`${enquiries.length} enquiries → ${url}  (${sent} sent)`, width));
    const footer = styleText("dim", fit("↑/↓ move · PgUp/PgDn page · Enter send · q quit", width));
    stdout.write(`\x1b[H\x1b[J${[header, ...renderList(enquiries, statuses, cursor, visibleRows(), width), footer].join("\n")}`);
  };

  const submit = async (i: number) => {
    if (statuses.get(i) === "sending…") return;
    statuses.set(i, "sending…");
    draw();
    statuses.set(i, await send(url, enquiries[i]!));
    draw();
  };

  stdout.write("\x1b[?1049h\x1b[?25l"); // alternate screen, hide cursor
  process.on("exit", () => stdout.write("\x1b[?25h\x1b[?1049l"));
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdout.on("resize", draw);
  stdin.on("keypress", (_str: string | undefined, key: Key | undefined) => {
    const name = key?.name ?? "";
    if (name === "q" || (key?.ctrl && name === "c")) process.exit(0);
    if (name === "return") return void submit(cursor);
    const page = visibleRows() - 1;
    const steps: Record<string, number> = { up: -1, k: -1, down: 1, j: 1, pageup: -page, pagedown: page, home: -last, end: last };
    const step = steps[name];
    if (step === undefined) return;
    cursor = Math.max(0, Math.min(cursor + step, last));
    draw();
  });
  draw();
}

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { url: { type: "string", default: DEFAULT_URL } },
  });
  if (positionals.length > 0 || !URL.canParse(values.url)) {
    console.error(USAGE);
    return 1;
  }
  if (!process.stdin.isTTY) throw new Error("needs an interactive terminal");
  run(loadEnquiries(readFileSync(INBOX, "utf8")), values.url);
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
