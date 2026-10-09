# 0001. Jev extracts, rules decide

- Status: accepted
- Date: 2026-10-09

## Context

Each enquiry must end in exactly one Outcome: a Route, an Information Request, an Automated Reply or Ignore. Shellworks needs to be able to say why any given email went where it did, and to change a rule (for example the nurture threshold) without re-prompting a model.

Jev (TypeSafe AI) gives calibrated probabilities over labels you define (`choice`) and a probability of yes (`noul`). It has no free-text output, so it cannot write a decision or an explanation.

## Decision

Jev answers a fixed set of eight typed questions per enquiry (category, annual volume, decision timeline, commitment, blocker, hard deadline, chasing, enough information). A pure function, `decide` in `src/rules.ts`, turns those probabilities into the Outcome and a plain-English `why`. Jev never chooses the action.

## Alternatives considered

- **Jev picks the action directly** (one `choice` whose labels are the Outcomes). Fewer moving parts, but the label set mixes "who is this" with "what do we do", so a policy change (e.g. reply to licensing requests instead of routing them) means rewriting label descriptions and re-validating the model. The decision would also be opaque.
- **Both, compared.** Doubles cost and adds a reconciliation rule that is itself a decision to justify. Not worth it before there is evidence the rules disagree with the model.

## Consequences

- Every decision is explained by a `why` string and can be reproduced by re-running `decide` on the same probabilities.
- Policy lives in one table and one rule order, covered by unit and property tests that need no network.
- The `SHELLWORKS` product facts and the category label descriptions are what Jev reads, so editing them changes behaviour and needs a fresh live check against the sample inbox.
- Extra questions cost nothing per call but each one is a signal the rules must explain; add one only when a rule needs it.

Update 2026-10-09: the urgent flag was removed, and with it the `hard_deadline` and `chasing` questions, leaving six. The confidence bar, the categories (their descriptions and outcomes) and the Shellworks facts moved to `triage.config.json`. The rule order stays in `decide`.
