# Triage logic

How each enquiry gets its Outcome, and why. Routing only: nothing is scored or ranked.

## Principle

Jev extracts, rules decide ([ADR 0001](decisions/0001-jev-extracts-rules-decide.md)). Jev returns probabilities for eight questions. `decide` in `src/rules.ts` applies the rules below in order; the first match wins.

## Classify by what the sender wants

Category is judged by what the sender wants to receive from Shellworks, not by their company type. A moulder asking for finished jars is a buyer; the same moulder asking to process the material is a licensing request. Shellworks manufactures finished packaging end to end and does not license or sell the material, so the second case gets a polite automated "no".

## The confidence bar

One knob, `CONFIDENCE = 0.7`, in `src/rules.ts`. It is measured on the **outcome**, not the category: probabilities of categories that share a destination are added. `buyer_direct` 0.5 and `buyer_intermediary` 0.4 is a 0.9 Sales outcome, so Jev need not separate two buyer types to be useful. A single global bar was chosen over per-action thresholds to keep the system explainable; split it only if the live run shows one action needs a different bar.

The same bar gates every probabilistic action (flags, nurture triggers, "not enough information"). There are no other thresholds.

## Rules, in order

1. **Legal and safety first.** If `legal_safety` is the top category (ties resolve towards it), route to Founders, urgent, whatever the confidence. It is never replied to or ignored. A missed safety report costs far more than an unneeded human read.
2. **Not sure where it goes.** If the best destination is below 0.7, route to Triage Review. Because probabilities sum to 1, any reply or ignore therefore implies P(legal_safety) ≤ 0.3 and P(buyer) ≤ 0.3.
3. **Buyers** (Sales-bound):
   - Probably missing who they are or what they want (`1 - enough_info ≥ 0.7`): **Information Request**. Asks company and application always, and volume, timeline or budget only where that signal is `unstated`.
   - Else under 10,000 units a year, or (more than a year away **and** no budget), each ≥ 0.7: **Nurture** reply. 10,000 is the bottom of the published catalogue minimum (10,000 to 25,000).
   - Else **Sales**.
4. **Everything else follows the destination table.**

| Category | Outcome |
|---|---|
| buyer_direct, buyer_intermediary | rule 3 |
| licensing_request | Automated reply: we make finished packaging, we do not license |
| existing_customer | Customer Success, urgent |
| consumer | Automated reply: shop link |
| relevant_supplier | Operations |
| vendor_solicitation | Ignore |
| press_events | Press & Events |
| investor, industry_stakeholder | Founders |
| research | R&D |
| job_seeker | Automated reply: careers page |
| out_of_scope | Automated reply: not our product |
| legal_safety | rule 1 |

Information Requests go only to buyers. A thin message from a vendor is still ignored; a thin message from a possible customer gets asked.

## Flags

Flags help the receiving person; they never change the Outcome.

- `urgent`: P(hard deadline) ≥ 0.7, P(chasing) ≥ 0.7, or the destination is Customer Success or legal and safety. Urgent cards show an `Urgent` row with the reason (deadline, chasing, or the destination rule).
- `price_cap`, `geography`, `technical_requirement`: that blocker's probability ≥ 0.7. They tell Sales what to check first.

## Replies

Fixed templates, never generated. Each starts "This is an automated reply from Shellworks." and never promises price, supply or dates. Nurture may cite the published minimum.

## What Jev is told about Shellworks

`SHELLWORKS` in `src/jev.ts` is included in the `category` and `blocker` questions. It states what Shellworks makes (rigid packaging and components such as jars, dropper bottles, dropper caps and pipettes, closures and caps, perfume caps, bottles, refillable containers and cups, made by injection moulding, blow moulding and extrusion from Vivomer, plus a consumer cutting board), what Vivomer is (bio-based PHA, home-compostable, food-contact certified) and which plastics it can mimic, the main market, the temperature range and grades, barrier and durability, processing and finishing options, certifications, where it manufactures, the catalogue minimum, and that it does not license the material or sell it as pellets or resin. Source: the Vivomer research report and shellworks.com. Without it Jev had nothing to judge `out_of_scope` against: run 1 sent a request for compostable poo bags to Sales.

Only what the sources state is included, with one deliberate exception: it says that microwave use is not stated, so Jev treats it as unknown rather than guessing. There is no "does not make" list.

## Failure

- Transient Jev failure (connection, rate limit, 5xx) after the SDK's retries: that enquiry goes to Triage Review with the error, and the API answers 204.
- Anything else (bad key, bad request, unexpected response): the API answers 502 and the error is printed. Hiding a systemic fault as a per-email routing outcome would silently send every email to a human.
- A 408 that persists after the SDK's retries is currently treated as systemic.

## Edge cases

| Case | Handling |
|---|---|
| Converter wants to license or buy pellets | Licensing reply; never Sales |
| Contract filler or adviser buying finished packaging for clients | Buyer intermediary, Sales |
| Adviser who cannot name the client | Sales; the adviser is identified and the request is clear |
| Tiny but promising buyer (below 10,000 units) | Nurture, not Sales |
| Buyer far off with no budget | Nurture |
| Very thin "send specs" email | Information Request |
| Buyer with a deadline | Sales, flagged urgent |
| Buyer who is chasing an unanswered email | Sales, flagged urgent |
| Existing customer with a line stoppage | Customer Success, urgent |
| Safety, legal or data-protection message | Founders, urgent, never auto-replied |
| Message that could be two unrelated things | Triage Review |
| Vendor pitch dressed as a partnership | Ignore only if confident, otherwise Triage Review |
| Pitch that mixes buyer and vendor | Probabilities split across destinations, Triage Review |
| Non-English message | Jev classifies it; replies are English only |
| Jev unavailable | See Failure |
| Empty `from_name` | Greeting "Hi there" |

Deadlines are judged from the wording ("by Friday") by Jev; there is no date arithmetic.

## Non-goals

Scoring or ranking; sending email or touching a mailbox; CRM integration; company enrichment; non-English replies; attachments; thread memory in the demo; concurrency; model pinning; learning from feedback.

## Expected outcomes for the sample inbox

Written **before** the first live run, from reading the 40 emails in `data/inbox.csv`, and delivered to the API one at a time (`pnpm send` replays them). The live runs are judged against this; any disagreement is reported, not tuned away. "Borderline" marks rows where a reasonable classifier could go either way. See "Live results" below.

| # | Sender | Expected | Notes |
|---|---|---|---|
| 1 | Lumen Botanicals | Sales | 180k units, deciding within months |
| 2 | Terra Nine | Sales | 250k, funded; `technical_requirement` (filling) |
| 3 | Wildroot Co | Nurture reply | about 2,000 units |
| 4 | Promold Ibérica | Licensing reply | moulder wants licence or supply |
| 5 | Nord Extrusion | Operations | compounding capacity |
| 6 | TU Delft student | R&D | thesis interview |
| 7 | Packaging Europe | Press & Events, urgent | deadline Friday |
| 8 | Denise Kowalczyk | Out-of-scope reply | wants poo bags |
| 9 | Andrew Bell | Consumer reply | wants the cutting board |
| 10 | Apex Search Partners | Ignore | recruiter |
| 11 | Northlight Growth | Founders | investor |
| 12 | C. Duvall | Information Request | no company, no application. Borderline (Sales) |
| 13 | Haldane Partners | Sales | adviser, client unnamed. Borderline (Information Request) |
| 14 | Harbor Foods | Sales | 4M trays; `technical_requirement` (-18°C to microwave). Borderline (Triage Review): trays and microwave use are not documented |
| 15 | The Farrow Kitchen | Nurture reply | 8,000 units; press upside is Sales' call later |
| 16 | Brightleaf Wellness | Nurture reply | 2028, no budget |
| 17 | Maison Le Rêve | Sales, urgent | 90k caps, quote by Thursday; `technical_requirement` (wear) |
| 18 | University of Bath | R&D | research consortium. Borderline (Founders) |
| 19 | Meridian Polymers | Operations | PHA supply |
| 20 | Stillwater Supply | Sales, urgent | contract manufacturer, 400k, chasing |
| 21 | Kestrel Foods | Sales | assistant booking a call. Borderline (Information Request) |
| 22 | GrowthScale Media | Ignore | marketing agency |
| 23 | Verve Botanica | Customer Success, urgent | cracking jars, line stopped |
| 24 | Aldwych Retail | Founders | retailer setting supplier requirements |
| 25 | Daniel Iwu | Careers reply | speculative CV |
| 26 | Material World | Press & Events | podcast |
| 27 | Northmoor Supplements | Sales | 15,000 units, above the 10,000 line |
| 28 | Keystone Molding | Licensing reply | wants to be approved processor |
| 29 | Claymoor Recycling | R&D | technical questions, not a buyer |
| 30 | EPR Navigator | Ignore | compliance tooling. Borderline (Triage Review) |
| 31 | Barkwell Pet | Sales | 300k, budget approved; `geography` possible (US co-packer) |
| 32 | SustainPack Summit | Press & Events | speaker invitation |
| 33 | AurumFill | Sales | contract filler, 600k |
| 34 | Meridian Wellness | Sales | 220k; `geography` (Australia) |
| 35 | Havlund Innovation | Licensing reply | wants pellets for trials. Borderline (Triage Review) |
| 36 | Harrington IP | Ignore | patent watch |
| 37 | Forma Haircare | Sales | 500k; `price_cap` (15% over PP) |
| 38 | OceanReach Trust | Press & Events | charity seeking partner |
| 39 | Baltic Trans Global | Ignore | freight |
| 40 | Northstar Nutrition | Sales, urgent | 200k, decision this month |

Tally: Sales 13, Automated replies 9 (nurture 3, licensing 3, consumer 1, out-of-scope 1, careers 1), Information Request 1, Customer Success 1, Founders 2, Operations 2, Press & Events 4, R&D 3, Ignored 5, Triage Review 0. Total 40.

## Live results (model jev-1.13.0)

**Run 1**, before `SHELLWORKS` was added (CSV batch): 38 of 40 as expected. #8 (poo bags) went to Sales (`buyer_direct` 0.86) and #12 to Triage Review (buyer 0.68, just under the bar).

**Run 2**, with `SHELLWORKS`, through the API: all 40 returned 204 and 38 of 40 outcomes match the expected table. #12 landed on the borderline alternative (Sales) and #14 went to Triage Review (see its row).

| # | Expected | Got | Note |
|---|---|---|---|
| 8 | Out-of-scope reply | Out-of-scope reply (0.98) | fixed by the product facts |
| 12 | Information Request (borderline Sales) | Sales (buyer 0.96) | within the borderline range |
| 14 | Sales | Triage Review | `out_of_scope` 0.43, buyer 0.57. Frozen-meal trays are not among the listed products and microwave use is not documented, so Jev doubts Shellworks can serve them. Whether trays are within spec is unknown, so a human read is defensible rather than a regression. |
| 13 | Sales | Sales, urgent | NDA "this week" reads as a deadline |
| 2 | Sales, `technical_requirement` | same | flag now fires |

Token use for the 40 enquiries: 106,755 (about 2,700 each, roughly 2,200 in and 450 out).

**Run 3**, with the fuller spec in `SHELLWORKS` (temperature range and grades, barrier, processing and finishing, certifications): all 40 returned 204 and no destination changed from run 2. #14 stays in Triage Review with the buyer total up to 0.64 (`out_of_scope` 0.36), still under the bar. Flag changes only: #2 lost `technical_requirement` and #31 gained `geography` (US co-packer). Token use rose to 117,876 for the 40 (about 2,950 each) because the prompt is longer.
