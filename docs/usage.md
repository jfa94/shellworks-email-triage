# Usage

A local API. Another app POSTs one inbound enquiry as JSON; the tool asks Jev six questions about it, applies the rules, and prints the Outcome in the terminal. Nothing is sent to the sender.

## Setup

Needs Node 24.2 or later (it was developed on 26 and runs TypeScript directly) and pnpm.

```
pnpm install
```

Put your key in `.env`, which is not committed:

```
TYPESAFE_API_KEY=...
```

## Run

```
pnpm triage              # listens on 127.0.0.1:3000
pnpm triage --port 8080
```

The server binds to localhost only and has no authentication. It reads `triage.config.json` once at startup, so restart it after editing that file.

## Send an enquiry

```
curl -X POST http://127.0.0.1:3000/enquiries -d '{
  "id": "1", "received": "19/08/2026",
  "from_name": "Maren Voss", "from_email": "maren@lumenbotanicals.com",
  "subject": "Packaging enquiry", "body": "We need 180k jars a year..."
}'
```

All six fields are required strings, though they may be empty; extra fields are ignored. Enquiries are processed one at a time.

The terminal prints a card per enquiry, showing:

- what came in: from, subject, and a two-line excerpt of the body;
- the category, with one confidence figure;
- buyer signals, for buyers;
- anything Sales should check;
- the full reply text, where one would be sent;
- the Outcome, in bold;
- the TypeSafe AI tokens used.

`acts at 70%` appears only when low confidence sent the enquiry to Triage Review. Cards fill the terminal width, or 64 columns when output is not a terminal.

## Send from the sample inbox

`data/inbox.csv` holds 40 sample enquiries. With the server running, in a second terminal:

```
pnpm send                # POSTs to http://127.0.0.1:3000/enquiries
pnpm send --url http://127.0.0.1:8080/enquiries
```

| Key | Action |
|---|---|
| ↑/↓ or k/j | Move |
| PgUp/PgDn | Page |
| **Enter** | Send the highlighted row, which is marked `[sent]` or `[failed …]` with the reason. Press Enter again to resend. |
| q | Quit |

Status is not kept between runs.

## Responses

The response says whether the enquiry was triaged, not where it went; that is printed.

| Status | Meaning |
|---|---|
| 204 | Triaged. This includes Triage Review after a temporary Jev failure. |
| 400 | The body is not valid JSON, is not a JSON object, or has a missing or non-string field (the message names it). |
| 404 / 405 | Wrong path / not POST. Only `POST /enquiries` exists. |
| 413 | The body is over 1 MB. |
| 502 | Jev failed in a way retrying will not fix (bad key, bad request). The error is printed and the server keeps running. |

Startup exits with code 1 for any of these:

- an invalid `triage.config.json` (the message names the field);
- a missing key;
- a bad `--port`;
- an unknown option or an extra argument;
- a port already in use.

## Develop

```
pnpm typecheck
pnpm test
```
