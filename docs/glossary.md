```yaml
context: root
purpose: Decide what should happen to each inbound enquiry Shellworks receives, so no person has to read them all.
scope:
  in: inbound enquiries, how they are classified and routed, and the automated replies sent on Shellworks' behalf
  out: the work the receiving team does after an enquiry is routed; outbound sales; existing-customer account management; lead scores, ranking or prioritising enquiries
last-reviewed: 2026-10-09
```

### Enquiry

- **type**: Entity
- **status**: draft
- **definition**: A single inbound message from someone outside Shellworks, arriving through email or the website contact form. The unit the triage decides on.
- **invariants**:
  - Every enquiry receives exactly one Outcome.
  - An enquiry is never silently dropped; even an Ignore is recorded.
- **examples**: A brand asking for samples of a 60ml jar; a journalist asking for a quote by Friday. Counter-example: a reply in an existing thread with a customer is a continuation, not a new enquiry.
- **relationships**: has one Category (none when it could not be classified); receives one Outcome; may be assigned to one Route.

### Category

- **type**: Value Object
- **status**: draft
- **definition**: What the sender wants to receive from, or do with, Shellworks (for example buy finished packaging, license the material, interview a founder). It is judged from the request, not from the kind of company the sender works for.
- **invariants**:
  - Every enquiry that was classified has exactly one most likely Category.
  - Each Category has one default destination; Categories with the same destination are treated as one when deciding. A buyer may instead receive an Information Request or Nurture, and any Enquiry except a Legal & Safety Enquiry goes to Triage Review when confidence is low.
- **examples**: A contract filler wanting jars for its clients is a Buyer Intermediary; the same filler asking to mould the material itself is a Licensing Request.
- **relationships**: describes an Enquiry; determines its Outcome.

### Buyer Direct

- **type**: Value Object
- **status**: draft
- **definition**: A Category: a brand that wants finished packaging for its own products.
- **invariants**:
  - Goes to the same destination as a Buyer Intermediary.
- **examples**: A skincare brand replacing a PP jar.
- **relationships**: a Category of Enquiry.

### Buyer Intermediary

- **type**: Value Object
- **status**: draft
- **definition**: A Category: a contract manufacturer, filler, co-packer or adviser who wants finished packaging on behalf of brand clients.
- **invariants**:
  - Treated as a buyer, never as a Licensing Request.
- **examples**: A contract filler representing three cosmetics clients.
- **relationships**: a Category of Enquiry.

### Route

- **type**: Value Object
- **status**: draft
- **definition**: The team or function at Shellworks that should own an enquiry once it has been triaged (for example, the sales team). A label describing where the enquiry would go, not a mailbox.
- **invariants**:
  - Each route corresponds to a function someone at Shellworks is responsible for.
- **examples**: Sales; Press & Events. Counter-example: "sales@" is a mailbox, not a route.
- **relationships**: assigned to an Enquiry as part of its Outcome.

### Outcome

- **type**: Value Object
- **status**: draft
- **definition**: What the triage decides should happen to an enquiry: hand it to a Route, send an Information Request, send an Automated Reply, or Ignore it.
- **invariants**:
  - Exactly one outcome per enquiry.
  - The triage acts on an Outcome only when it is confident of it; otherwise a person decides (Triage Review).
- **examples**: A supplements brand deciding this month is handed to Sales. A one-line "send specs" from an unknown sender receives an Information Request.
- **relationships**: belongs to an Enquiry; may name a Route.

### Outcome Confidence

- **type**: Value Object
- **status**: draft
- **definition**: How likely it is that an Enquiry belongs with a given Outcome, counting together every Category that leads to that Outcome. It is the score the triage acts on: it acts on an Outcome only when its Outcome Confidence reaches the confidence bar.
- **invariants**:
  - Measured on the Outcome, not on any single Category.
  - Below the confidence bar, the Enquiry goes to Triage Review, unless it is a Legal & Safety Enquiry.
- **examples**: A message that is 50% likely from a brand and 40% likely from a contract filler is 90% likely to belong with Sales. Counter-example: a lead score ranking how valuable a buyer is; the triage does not produce one.
- **relationships**: measured for each Outcome of an Enquiry; decides between acting and Triage Review.

### Automated Reply

- **type**: Policy
- **status**: draft
- **definition**: A message sent on Shellworks' behalf without a person writing it, either closing the enquiry with an answer (such as explaining that Shellworks does not license its material) or asking for missing details.
- **invariants**:
  - It always states clearly that it is automated.
  - It never commits Shellworks to price, supply, or a deadline.
  - It is never sent for a Legal & Safety Enquiry.
- **examples**: "This is an automated reply from Shellworks. … Shellworks manufactures finished packaging end to end, so we do not license our material or supply it to other manufacturers."
- **relationships**: one kind of Outcome; Information Request is a specialisation.

### Information Request

- **type**: Policy
- **status**: draft
- **definition**: An Automated Reply asking a likely buyer for specific missing details, needed before the enquiry can be handed to Sales.
- **invariants**:
  - Only sent to likely buyers.
  - It always asks who the sender is and what they want it for; beyond that it asks only for the details that are actually missing.
- **examples**: Asking a sender with no company or volume stated which company they represent and what volumes they need.
- **relationships**: a kind of Automated Reply.

### Nurture

- **type**: Policy
- **status**: draft
- **definition**: An Automated Reply to a likely buyer who is not ready or not yet large enough to be worth Sales' time (below the catalogue minimum, or more than a year away with no budget). It states the published minimum and points to the FAQ and contact page.
- **invariants**:
  - Never tells the sender they are rejected; it invites them back when ready.
- **examples**: A founder planning a first run of 2,000 units.
- **relationships**: a kind of Automated Reply.

### Licensing Request

- **type**: Value Object
- **status**: draft
- **definition**: An enquiry from a converter, moulder or other processor asking to license, process, or buy Vivomer as raw material. Shellworks manufactures end-to-end and does not offer this.
- **invariants**:
  - Answered with an Automated Reply explaining the end-to-end model, unless the triage is unsure it is one, in which case a person decides.
- **examples**: An injection moulder asking how to become an approved processor. Counter-example: a contract filler wanting to buy finished jars for its brand clients is a Buyer Intermediary, not a licensing request.
- **relationships**: a Category of Enquiry.

### Legal & Safety Enquiry

- **type**: Value Object
- **status**: draft
- **definition**: An enquiry reporting a safety issue or injury, threatening legal action, making a data-protection request, or coming from a regulator.
- **invariants**:
  - When it is the most likely Category, always reaches Founders, even if that likelihood is low.
  - Never auto-replied and never ignored.
- **examples**: A customer reporting a product shattered and caused injury.
- **relationships**: a Category of Enquiry.

### Triage Review

- **type**: Value Object
- **status**: draft
- **definition**: The Route for an enquiry the triage is not confident enough to act on, or could not classify. A person decides what happens next.
- **invariants**:
  - Nothing is sent to the sender from this Route.
- **examples**: A message that reads half like a press request and half like a research request.
- **relationships**: a Route; the fallback for any Outcome that fails the confidence bar, except a Legal & Safety Enquiry.

### Ignore

- **type**: Policy
- **status**: draft
- **definition**: The Outcome for unsolicited vendor outreach that needs no response: the enquiry is logged but nobody is notified and nothing is sent.
- **invariants**:
  - Only applied when the triage is confident the sender is selling unrelated services.
  - Never applied to anyone who is, or may be, a customer.
- **examples**: A freight forwarder offering a rate card; a growth agency asking for a call.
- **relationships**: a kind of Outcome.
