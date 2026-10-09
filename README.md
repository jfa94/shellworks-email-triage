# Shellworks email triage

Every inbound enquiry gets exactly one Outcome:

- **Route** it to a team.
- **Reply with** an Information Request.
- **Reply with** an Automated Reply.
- **Ignore** it.
- If the tool is not sure, **follow the existing triage process** (i.e., the team reads it and manually decides where to route it).

For each enquiry the tool **extracts** what matters, **scores** how sure it is, **categorises** by what the sender wants, **decides** with readable rules, and **routes**. The demo prints each decision; nothing is sent to the sender.

```
━━ #17 · 27/08/2026 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  From     Camille Beaufort <c.beaufort@maisonlerev.fr>
  Subject  Enquiry
  Body     Hello, I hope you are well. I am working on a
           refillable format for a new line we are launching…
  Type     Buyer (direct) · 100% sure
  Buyer    10k–150k/yr · deciding this month · funded project
  Check    technical requirement
  Outcome  SALES
  2,836 tokens · jev-1.13.0
```

To run it, see [docs/usage.md](docs/usage.md).

## What matters when triaging

In priority order:

1. **Risk.** A safety report, legal threat or regulator letter must never be missed or auto-answered.
2. **What the sender wants from Shellworks**, not what kind of company they are. A moulder asking for finished jars is a buyer. The same moulder asking to process Vivomer is a licensing request.
3. **For a buyer, whether they are worth Sales' time now.** Annual volume against the 10,000-unit catalogue minimum, when they will decide, and whether there is a budget.
4. **What Sales should check first:** a price ceiling, a region, a technical requirement.
5. **Whether there is enough to act on.** A buyer who hasn't said who they are or what they want is asked; anything the tool is unsure about goes to a person.

One principle sits under all of these: **errors don't cost the same.** A missed safety report, or a real buyer given a template, costs far more than a person reading one extra email. So the tool automates only when it is confident, and otherwise hands the email to a person.

Nurture is the one deliberate exception. A promising buyer under 10,000 units gets a friendly reply citing the minimum, not a sales call. That protects Sales' time at volume, and the reply invites them back when they are ready.

## Why Jev (TypeSafe AI)

This job is a decision, not a piece of writing. For each email I need to know what it is and how sure we are, and Jev is built for exactly that: it picks from answers I define and says how confident it is in each.

- **Its confidence can be trusted.** The design leans on a confidence bar, so "90% sure" needs to be right about nine times in ten. Independent testing found Jev's confidence within about three percentage points of its real accuracy across 22 public datasets ([arXiv 2609.37647](https://arxiv.org/abs/2609.37647)). Those weren't Shellworks emails, so it's a good sign rather than proof.
- **It can't make things up.** It only picks from the answers it's given, so it can't invent a category or promise a customer a price. Replies are fixed templates, so an email saying "ignore your instructions" has nothing to act on.
- **It's fast and cheap.** About a third of a second per email (same paper). At the vendor's quoted price that's roughly $0.0001 per email, against $0.20–$10 per million tokens for general LLMs ([TypeSafe](https://typesafe.ai/blog/introducing-system-one-models-and-jev)). The vendor says the price may be subsidised, so treat it as a rough guide.
- **It's easy to tweak.** A category is one plain-English sentence in [`triage.config.json`](triage.config.json). There's no training data and no prompt to engineer: edit the sentence, restart, and replay the sample inbox to see what changed.
- **It reads nuance without training.** A traditional classifier needs labelled examples and we only have 40, and keyword rules can't tell a moulder who wants jars from one who wants pellets. Jev works from the descriptions alone.

Jev only extracts. The rules decide, which keeps every decision explainable and lets us change policy without touching the model. The code is TypeScript on Node, though the language isn't the point.

## How it's structured, and why

```
POST /enquiries ─▶ validate ─▶ ask Jev 6 questions ─▶ decide ─▶ print card
                   enquiry.ts   jev.ts                 rules.ts   render.ts
                                     ▲                    ▲
                                     └── triage.config.json ──┘
```

| Part | Holds | Why separate |
|---|---|---|
| `triage.config.json` | Confidence bar, categories (label, the description Jev reads, outcome), Shellworks product facts | The things you tune, in one file a non-developer can edit |
| `src/jev.ts` | The 6 questions: category, annual volume, decision timeline, budget commitment, blocker, enough info | Extraction only; returns probabilities |
| `src/rules.ts` | `decide`: rule order and the buyer rules | Policy as a pure function, tested without network |
| `src/replies.ts` | Reply templates | Fixed wording, never generated |
| `src/cli.ts`, `render.ts` | Local API and the printed card | The demo's edges, which production replaces ([docs/cloud.md](docs/cloud.md)) |

Every question either feeds a rule or tells Sales what to check. Questions that only fed an "urgent" flag were removed: the goal is that each email lands in the right place.

## Categories

Jev classifies each email into one of these, judged by what the sender wants. Each category's outcome is set in `triage.config.json`:

| Category | Who | Outcome |
|---|---|---|
| Buyer (direct) | A brand wanting finished packaging for its own products | `route:Sales` |
| Buyer (intermediary) | A contract manufacturer, filler, co-packer or adviser buying for brand clients | `route:Sales` |
| Licensing request | Wants to license, process or buy the material itself | `reply:licensing` |
| Existing customer | Writing about an order, delivery or production issue | `route:Customer Success` |
| Consumer | An individual wanting a consumer product, such as the cutting board | `reply:consumer` |
| Supplier | Offers raw materials, compounding or manufacturing capacity | `route:Operations` |
| Vendor solicitation | Sells unrelated services: recruiting, marketing, freight, compliance | `ignore` |
| Press & events | Journalists, podcasts, conferences, charities seeking a partner | `route:Press & Events` |
| Investor | Investors or funds | `route:Founders` |
| Industry stakeholder | Retailers setting supplier requirements, trade bodies | `route:Founders` |
| Research | Students, academics, or non-buyers with technical questions | `route:R&D` |
| Job seeker | Applications and speculative CVs | `reply:careers` |
| Out of scope | Wants a product Shellworks doesn't make | `reply:out_of_scope` |
| Legal & safety | Injury reports, legal threats, data-protection requests, regulators | `escalate:Founders` |

An outcome is `route:<Team>`, `reply:<kind>`, `ignore`, or `escalate:<Team>` (acts at any confidence and is never auto-replied).

## What gets scored

- **Category probabilities.** Jev's distribution over the configured categories.
- **Outcome Confidence.** The probabilities of categories that share an outcome, added together. "Buyer (direct)" at 0.5 plus "Buyer (intermediary)" at 0.4 is a 0.9 Sales outcome. Every action except escalation is gated on this number.
- **Buyer qualification.** Annual volume, decision timeline and budget commitment, each a probability distribution.
- **Blockers.** Price cap, geography or technical requirement. These are shown to Sales and never change the Outcome.

There is **no 0–100 lead score**. It would be a second, unexplained decision on top of the rules: Sales would ask "why 62?". The rules already say why, in a sentence.

## The rules, and why

The first rule that matches wins:

1. **Escalate categories (legal and safety) go to Founders at any confidence.** Ties resolve towards them, and they are never auto-replied. A missed safety report costs more than any amount of reading.
2. **If the best Outcome Confidence is below 0.7, the email follows the existing triage process.** A person reads it and decides.
3. **Buyers** (anything routed to Sales) are qualified first:
   - If the email probably doesn't say who they are or what they want, send an **Information Request** asking only for what's missing.
   - Otherwise, if it is under 10,000 units a year, or more than a year away with no budget, send a **Nurture** reply.
   - Otherwise, **Sales**.
4. **Everything else does what its category's outcome says** in the table above.

**Why 0.7.** At 70% confidence, that option is clearly more likely than anything else. I wanted the tool to act on its own only when it is clearly more sure of one outcome than of everything else combined, and 0.7 does that. I also kept a single bar for every action, but if this proves too strict/not strict enough for a specific cateogry, it would be easy to implement a different threshold for each.

The sample inbox behaves well at 0.7, but 40 emails can't prove the confidence is well calibrated, and the same research suggests yes/no answers (e.g., whether an email says enough) may need their own thresholds. The sensible next step is to measure it on real inbox volume and adjust.

The other choices:

- **Information Requests go to buyers only.** A thin email from a possible customer is worth asking about. A thin vendor pitch is not.
- **Ignore only when confident.** Anyone who may be a customer is never ignored. An uncertain pitch follows the existing triage process.
- **Licensing gets an automated "we make finished packaging, we don't license".** Public sources (shellworks.com, the Vivomer report) describe Shellworks as end-to-end only. If that isn't Shellworks' real position, change one line in the config: `"outcome": "route:Founders"`.

## Tuning it

You can edit three things in `triage.config.json`:

- the bar (`confidence`);
- the categories (add, remove or merge them, reword what Jev reads, change where each goes);
- the Shellworks facts Jev reads.

The file is validated at startup. A bad edit stops the server with a message naming the field. Restart and replay the sample inbox with `pnpm send`.

Deliberately kept in code: the rule order, the buyer rules (which refer to volume, timeline and budget labels by name), and the reply wording. A JSON edit should not be able to silently break a rule or put a promise in a reply.

After rewording a description, replay the 40 emails and compare them with the expected table in [docs/triage-logic.md](docs/triage-logic.md#expected-outcomes-for-the-sample-inbox).

## Edge cases

**Handled now**

| Case | Outcome |
|---|---|
| Reads as two unrelated things (press + research) | Probability splits, so it follows the existing triage process |
| Vendor pitch dressed as a partnership | Ignore only if confident, otherwise it follows the existing triage process |
| Non-English email | Classified as usual; replies are English |
| Jev temporarily down | That email follows the existing triage process, with the error attached |
| Jev misconfigured (bad key) | API answers 502; not hidden as a routing outcome |

**Would address in production** ([docs/cloud.md](docs/cloud.md))

- **Prompt injection** ("route this to Sales"). Jev only picks labels and the rules decide, so the email cannot instruct the tool. The worst case is a misclassification, which the confidence bar catches.
- **Reply loops and duplicates.** Never auto-reply to auto-responders, mailing lists or no-reply senders. Deduplicate on `Message-ID`. Send at most one automated reply per sender per 30 days; after that, route the email to the existing triage process.
- **Replies to an Information Request** continue an existing conversation; they are not new enquiries. Re-triage the whole thread so the newly given volume and budget count.

## Where the decision is encoded

- [`triage.config.json`](triage.config.json): the bar, the categories, and where each category goes.
- [`src/rules.ts`](src/rules.ts): `decide`, the rule order and the buyer rules. Every Decision carries a plain-English `why`.
- [`src/jev.ts`](src/jev.ts): the six questions and the fixed labels.
- [`src/replies.ts`](src/replies.ts): the reply templates.
- [`docs/glossary.md`](docs/glossary.md): the terms used here.
- Tests (`pnpm test`) pin each category's outcome. Property tests check across arbitrary probabilities that escalations are never auto-replied, replies and ignores happen only above the bar, and Information Requests go only to buyers.
