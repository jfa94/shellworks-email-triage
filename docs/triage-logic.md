# Triage logic: reference

The reasoning behind the rules is in the [README](../README.md). This page holds the detail: exact rule behaviour, what Jev is told, failure handling, and the sample-inbox results.

The tunable parts are in [`triage.config.json`](../triage.config.json): the confidence bar, the categories, and the Shellworks facts. The rules are `decide` in `src/rules.ts`. There is no lead score or ranking; see [What gets scored](../README.md#what-gets-scored).

## Rules in detail

- **Confidence is measured on the Outcome, not the category.** Categories whose `outcome` strings are equal share one destination, and their probabilities are added. The same bar (`confidence`, 0.7) gates every probabilistic action: the Outcome, Information Request, Nurture, and the blocker flags. There are no other thresholds.
- **Escalate.** If an `escalate:<Team>` category is the most likely category, the email goes to that team, whatever its probability. Ties go to the escalate category.
- **Information Request** (buyers only): sent when `1 − enough_info ≥ 0.7`. It always asks for company and application. It asks for volume, timeline or budget only where that signal's top label is `unstated`.
- **Nurture** (buyers only): sent when P(under 10,000 units a year) ≥ 0.7, or when P(more than a year out) ≥ 0.7 **and** P(no budget) ≥ 0.7. 10,000 is the bottom of the published catalogue minimum (10,000 to 25,000).
- **Blocker flags** (`price_cap`, `geography`, `technical_requirement`): set when that blocker's probability is ≥ 0.7. They are shown as "Check" on the card and never change the Outcome.
- **Replies** are fixed templates in `src/replies.ts`. Each starts "This is an automated reply from Shellworks." and never promises price, supply or dates. Nurture may cite the published minimum.

## What Jev is told about Shellworks

`about_shellworks` in the config is included in the `category` and `blocker` questions. It covers:

- what Shellworks makes and how (moulding and extrusion from Vivomer, plus a consumer cutting board);
- what Vivomer is and which plastics it can mimic;
- the main market;
- the temperature range, barrier and durability;
- processing and finishing;
- certifications;
- where it manufactures;
- the catalogue minimum;
- that it does not license the material or sell it as pellets or resin.

Sources are the Vivomer research report and shellworks.com. Without these facts Jev had nothing to judge `out_of_scope` against: run 1 sent a request for compostable poo bags to Sales.

Only what the sources state is included, with one deliberate exception: the facts say that microwave use is not stated, so Jev treats it as unknown rather than guessing. There is no "does not make" list.

## Failure

- **Transient Jev failure** (connection, rate limit, 5xx) after the SDK's retries: that enquiry goes to Triage Review with the error, and the API answers 204.
- **Anything else** (bad key, bad request, unexpected response): the API answers 502 and the error is printed. Hiding a systemic fault as a per-email outcome would silently send every email to a person.
- A 408 that persists after the SDK's retries is currently treated as systemic.
- **Invalid `triage.config.json`:** the server refuses to start and the message names the field.

Deadlines and follow-ups are not detected. Urgency was removed on 2026-10-09; each email goes to the right place, and that team decides its priority.

## Non-goals

Lead scoring or ranking; urgency flags; sending email or touching a mailbox; CRM integration; company enrichment; non-English replies; attachments; thread memory in the demo; concurrency; model pinning; learning from feedback.

## Expected outcomes for the sample inbox

This table was written **before** the first live run, from reading the 40 emails in `data/inbox.csv`. The live runs are judged against it, and any disagreement is reported, not tuned away. "Borderline" marks rows where a reasonable classifier could go either way. "Urgent" markings were dropped from this table when urgency was removed; no destination changed.

| # | Sender | Expected | Notes |
|---|---|---|---|
| 1 | Lumen Botanicals | Sales | 180k units, deciding within months |
| 2 | Terra Nine | Sales | 250k, funded; `technical_requirement` (filling) |
| 3 | Wildroot Co | Nurture reply | about 2,000 units |
| 4 | Promold Ibérica | Licensing reply | moulder wants licence or supply |
| 5 | Nord Extrusion | Operations | compounding capacity |
| 6 | TU Delft student | R&D | thesis interview |
| 7 | Packaging Europe | Press & Events | deadline Friday |
| 8 | Denise Kowalczyk | Out-of-scope reply | wants poo bags |
| 9 | Andrew Bell | Consumer reply | wants the cutting board |
| 10 | Apex Search Partners | Ignore | recruiter |
| 11 | Northlight Growth | Founders | investor |
| 12 | C. Duvall | Information Request | no company, no application. Borderline (Sales) |
| 13 | Haldane Partners | Sales | adviser, client unnamed. Borderline (Information Request) |
| 14 | Harbor Foods | Sales | 4M trays; `technical_requirement` (-18°C to microwave). Borderline (Triage Review): trays and microwave use are not documented |
| 15 | The Farrow Kitchen | Nurture reply | 8,000 units; press upside is Sales' call later |
| 16 | Brightleaf Wellness | Nurture reply | 2028, no budget |
| 17 | Maison Le Rêve | Sales | 90k caps, quote by Thursday; `technical_requirement` (wear) |
| 18 | University of Bath | R&D | research consortium. Borderline (Founders) |
| 19 | Meridian Polymers | Operations | PHA supply |
| 20 | Stillwater Supply | Sales | contract manufacturer, 400k, chasing |
| 21 | Kestrel Foods | Sales | assistant booking a call. Borderline (Information Request) |
| 22 | GrowthScale Media | Ignore | marketing agency |
| 23 | Verve Botanica | Customer Success | cracking jars, line stopped |
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
| 40 | Northstar Nutrition | Sales | 200k, decision this month |

Tally: Sales 13, Automated replies 9 (nurture 3, licensing 3, consumer 1, out-of-scope 1, careers 1), Information Request 1, Customer Success 1, Founders 2, Operations 2, Press & Events 4, R&D 3, Ignored 5, Triage Review 0. Total 40.

## Live results (model jev-1.13.0)

| Run | Change | Matched | Differences | Tokens for 40 |
|---|---|---|---|---|
| 1 | First run, CSV batch | 38/40 | #8 (poo bags) went to Sales (`buyer_direct` 0.86). #12 went to Triage Review (buyer 0.68, just under the bar). | n/a |
| 2 | Added the Shellworks product facts; run through the API | 38/40 | #8 fixed (out-of-scope 0.98). #12 went to Sales, its borderline alternative (buyer 0.96). #14 went to Triage Review, see below. | 106,755 |
| 3 | Fuller product spec (temperature, barrier, processing, certifications) | 38/40 | No destination changed. #14 still in Triage Review (buyer 0.64, `out_of_scope` 0.36). Flags only: #2 lost `technical_requirement`, #31 gained `geography`. | 117,876 |
| 4 | Config moved to `triage.config.json`; urgency and its two questions removed | 38/40 | No destination changed from run 3, and all 40 returned 204. Flags only: #31 lost `geography` again; #14 and #17 `technical_requirement`, #34 `geography`, #37 `price_cap`. | 111,753 (about 2,800 each) |

**#14 (Harbor Foods, 4M frozen-meal trays)** lands in Triage Review in every run since product facts were added. Trays are not among the listed products and microwave use is not documented, so Jev doubts Shellworks can serve them. Whether trays are within spec is unknown, so a human read is defensible rather than a regression.

The blocker flags vary between runs at the edge of the bar (#2, #31). They never change a destination.
