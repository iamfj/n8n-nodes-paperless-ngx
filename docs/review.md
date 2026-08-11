# Review protocol

One canonical protocol, used by Conductor's Code Review action and by anyone asked to review by
hand, so both emit the same artefact.

**Scope:** the diff against the merge-base with `main` (`git diff origin/main...`), plus whatever a
finding forces you to open to confirm it.

**The review never fixes anything.** Not a typo, not a rule violation, not even a one-character
change. This is what makes it terminate: a review that can fix is a review that can re-check, and a
review that can re-check has no last iteration. Fixing is a separate action with its own bound.

Three phases, run once each, in order. No conditionals, no "until".

## 1. FIND

Read the diff and report every candidate. No tiers, no filtering, no judgement about whether
something is worth mentioning — precision is the next phase's job, and a finder that self-censors
under-reports. If it looks off, it goes on the list.

Cover at least: the four Cloud blockers, the layer and context import rules, `throw` inside `catch`,
version literals, credential values reaching a log/error/output, request idempotency, pagination
bounds, response shapes, tests, naming and comments.

## 2. TRIAGE

Every candidate is either given a tier or dropped **in writing**. A false positive killed on the
page costs one line and never comes back; one deleted silently gets re-raised on every future run.

| Tier | Means |
|---|---|
| `BLOCK` | A runtime dependency, `fs`, `process.env`, a lifecycle script, a hardcoded secret, or a credential value reaching a log, error or node output. Cloud rejects the package, or a token leaks. |
| `RULE` | Domain importing `n8n-workflow`; one context importing another; `throw` inside `catch` outside `*.node.ts`/`*.credentials.ts`; a version literal where `supports()` belongs; HTTP in a `.node.ts`; anything on `AGENTS.md`'s "Rejected by decision" list. The repo pays twice for a decision it already made. |
| `BUG` | Wrong at runtime: a non-idempotent request replayed, an unbounded page walk, a response shape guessed rather than read off the upstream serializer. A self-hosted user hits it and cannot tell why. |
| `NIT` | Naming, a comment that says what instead of why, a missing test for behaviour already correct. |

## 3. GATES

`npm run lint`, `npm run typecheck`, `npm run typecheck:test`, `npm run test`, `npm run build`.
Once. A gate you did not run is `not run`, never assumed `ok`.

## Report

Always emitted, always this shape — including when everything is red. An honest open finding is the
output; a clean-looking review that suppressed one is the failure mode. IDs are `TIER/kebab-slug`,
and the slug names the defect rather than the place, so it survives a line shift.

```
VERDICT: <blocked|changes|clean> — <n> BLOCK, <n> RULE, <n> BUG, <n> NIT; gates <n>/5 ok

FINDINGS
<TIER>/<slug>  <path>:<line>  <open|fixed>
  what  <one sentence>
  why   <one sentence naming the rule or the failure mode>
  fix   <one sentence, or: reported only>

DROPPED
<slug>  <what it looked like> — <why it is not real>

GATES
lint <ok|FAIL|not run>  typecheck <>  typecheck:test <>  test <>  build <>
  <first failing line of each FAIL>

NOT REVIEWED
- <area> — <why>
```

`blocked` on any BLOCK or failing gate, `changes` on any RULE or BUG, otherwise `clean`.

Each finding also goes on the diff itself — inline, at its line, via Conductor's DiffComment tool
when reviewing in Conductor, or as a review comment when reviewing a PR by hand. The report is the
summary; the inline comment is what the person fixing it actually reads. Nothing is posted to GitHub
unless asked.

Empty sections read `none` — except `NOT REVIEWED`, which is mandatory and names what could not be
checked: no live Paperless instance, an untested API version, the n8n runtime, a skipped gate, a
file skimmed. That section is why this protocol never has to claim completeness.

## What the bound does not buy

**It is per run, not per diff.** Nothing stops a human invoking review a fourth time, and nothing
should — only a person decides "ship it with these three open".

Recall is uncheckable from inside: a missed BLOCK and a genuinely clean diff produce the identical
report. CODEOWNERS, CI and the post-release scanner are the real net.
