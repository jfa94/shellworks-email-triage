# Shellworks email triage

A local API. Another app POSTs one inbound enquiry as JSON; the tool asks Jev (TypeSafe AI) a fixed set of typed questions about it, applies readable rules, and **prints** the Outcome in the terminal: route to a team, Information Request, Automated Reply, or Ignore. Routing only, no scoring. Nothing is sent to the sender.

Why it works this way: [docs/triage-logic.md](docs/triage-logic.md) and [ADR 0001](docs/decisions/0001-jev-extracts-rules-decide.md). Cloud design: [docs/cloud.md](docs/cloud.md).

## Setup

Needs Node 24.2 or later, developed on 26 (runs TypeScript directly) and pnpm.

```
pnpm install
```

Put your key in `.env` or `.env.local` (not committed):

```
TYPESAFE_API_KEY=...
```

## Run

```
pnpm triage              # listens on 127.0.0.1:3000
pnpm triage --port 8080
```

The server binds to localhost only and has no authentication.

## Send an enquiry

```
curl -X POST http://127.0.0.1:3000/enquiries -d '{
  "id": "1", "received": "19/08/2026",
  "from_name": "Maren Voss", "from_email": "maren@lumenbotanicals.com",
  "subject": "Packaging enquiry", "body": "We need 180k jars a year..."
}'
```

All six fields are required strings (empty is allowed); extra fields are ignored. Enquiries are processed one at a time.

The terminal shows each step and a card with the destination, category, confidence, signals, why, the full reply text where one would be sent, and the TypeSafe AI tokens used:

```
← #1  Maren Voss <maren@lumenbotanicals.com>  "Packaging enquiry"
  asking Jev…
━━ SALES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 #1  Maren Voss · lumenbotanicals.com
     buyer_direct 1.00 · outcome 1.00
     volume 150k_1m · decision this_quarter
     why: Buyer (1.00) with enough detail: Sales.
     TypeSafe AI tokens: 2287 in + 452 out = 2739 (jev-1.13.0)
```

## Send from the sample inbox

`data/inbox.csv` holds 40 sample enquiries. With the server running, in a second terminal:

```
pnpm send                # POSTs to http://127.0.0.1:3000/enquiries
pnpm send --url http://127.0.0.1:8080/enquiries
```

↑/↓ (or k/j) move, PgUp/PgDn page, **Enter** sends the highlighted row and marks it `[sent]` (or `[failed …]` with the reason; Enter again resends), q quits. Status is not kept between runs.

## Responses

The response says whether the enquiry was triaged, not where it went (that is printed).

| Status | Meaning |
|---|---|
| 204 | Triaged. Includes Triage Review after a temporary Jev failure. |
| 400 | Body is not valid JSON, is not a JSON object, or a field is missing or not a string (the message names it) |
| 404 / 405 | Wrong path / not POST. Only `POST /enquiries` exists. |
| 413 | Body over 1 MB |
| 502 | Jev failed in a way retrying will not fix (bad key, bad request); the error is printed and the server keeps running |

Startup exits with code 1 for a missing key, a bad `--port`, an unknown option or extra argument, or a port already in use.

## Develop

```
pnpm typecheck
pnpm test
```

Tuning lives in three places: `CONFIDENCE` and the destination table in `src/rules.ts`, and in `src/jev.ts` the `SHELLWORKS` product facts and the label descriptions.
