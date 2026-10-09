# Cloud design (not built)

The demo is a local API (`POST /enquiries`, localhost only, no auth) that prints each decision; `pnpm send` stands in for inbound mail by POSTing rows of the sample inbox. In production the same decision logic runs on a server against live email. Only the edges change: how enquiries arrive, who may call, and what is done with the decision.

```
inbound mail ──▶ webhook ──▶ guard ──▶ askJev ──▶ decide ──▶ effect
                                                  (unchanged)
```

`decide` and the reply templates are reused as they are. The `Decision` object (`outcome`, `route`, `reply`, `flags`, `why`, `error`) is the contract for the effect stage; the demo prints it as a card and the cloud version acts on it.

## Effects by outcome

| Outcome | Effect |
|---|---|
| route | Forward the original message to the team's mailbox or label it in the shared inbox. Prefix urgent ones. Triage Review goes to a person with the `why` attached. |
| information_request / automated_reply | Send the templated text from a no-reply-style address that accepts replies. |
| ignore | Archive with a label; send nothing. |

## Guards before classifying

- **Idempotency.** Key on the email `Message-ID`; a redelivered webhook must not produce a second reply or forward.
- **No auto-reply to machines.** Skip replies when `Auto-Submitted` is not `no`, or `Precedence: bulk/list/junk`, or a `List-Id` header is present, or the sender is a no-reply address. Classify and route as usual. This prevents reply loops.
- **At most one automated reply per sender per 30 days.** A second enquiry in the window is routed to Triage Review instead of replied to.
- **Never auto-reply to legal and safety enquiries** (already guaranteed by `decide`).

## Conversations

A reply to an Information Request is a continuation, not a new enquiry. Re-run the triage with the whole thread as input so the newly given volume, timeline and budget count. The demo does not do this.

## Errors

- Systemic Jev errors (bad key, permission, bad request) stop the worker and alert an operator. Mail is queued, not guessed at.
- Transient errors (connection, rate limit, 5xx) after the SDK's own retries send that message to Triage Review with the error attached; the queue continues.

## Open points

- Which mailbox or helpdesk each Route maps to (Routes are labels today).
- Whether Customer Success wants a phone or chat alert for urgent items.
- Retention of stored probabilities for audit.
