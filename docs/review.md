# Review protocol

One canonical protocol, used by Conductor's Code Review action and by anyone asked to review by
hand, so both emit the same artefact. Fixing has its own bound in `docs/fix.md`.

**Scope:** the first review of a branch reads `git diff origin/main...`. Every later one reads
`git diff <REVIEWED sha of the previous report>..HEAD` plus uncommitted work, and the report names
the sha it reviewed. Each round's input is then smaller than the last, which is the reason the
review→fix loop ends — with one leak: work that was uncommitted when a round read it is committed
after that round's sha, so the next round reads it again. Review a clean tree and it does not
happen. A fix that breaks a line no round has read falls to CI and the
tests; that net is named at the bottom of this file.

A line the diff did not add or change is **out of scope**, even when the diff touches its file. If
it is dangerous, it goes in `NOT REVIEWED`.

**The review never fixes anything.** Not a typo, not a rule violation, not even a one-character
change. This is what makes it terminate: a review that can fix is a review that can re-check, and a
review that can re-check has no last iteration.

Three phases, run once each, in order. No conditionals, no "until".

## 1. FIND

Read the diff and report every candidate. No tiers, no filtering, no judgement about whether
something is worth mentioning — precision is the next phase's job, and a finder that self-censors
under-reports. If it looks off, it goes on the list.

**A candidate cites a line — of a repo file, or of a gate's output.** A claim about Paperless,
Django, npm, Renovate or n8n that no file here contains is not a finding; it goes in `NOT REVIEWED`.
If it matters, it becomes a recorded fixture and a test, which turns it from something re-argued
every round into something the gates decide once. Two repo files contradicting each other is a
finding — both lines are citable.

Cover at least: version literals, credential values reaching a log/error/output, request
idempotency, pagination bounds, response shapes, tests, naming and comments. Not the four Cloud
blockers or `throw` inside `catch` — `npm run lint` owns those, and phase 3 runs it. Not the layer
or context import rules either: Biome owns those, and it runs from `npm run check`
(`package.json:35`) and from `npx biome ci .` in CI, neither of which is a gate here.

## 2. TRIAGE

Every candidate gets the one tier whose definition it **literally** matches. Matching none is a
drop; matching two is the higher one. The tier choice is the halting decision — exit is 0 BLOCK,
0 RULE, 0 BUG and 5/5 gates, and **a NIT never denies a round**.

| Tier | Means |
|---|---|
| `BLOCK` | A runtime dependency, `fs`, `process.env`, a lifecycle script, a hardcoded secret, or a credential value reaching a log, error or node output. Cloud rejects the package, or a token leaks. |
| `RULE` | A version literal where `supports()` belongs; HTTP in a `.node.ts`; anything on `AGENTS.md`'s "Rejected by decision" list except its last line — barrel files, `I`-prefixed interfaces, `Helper`/`Manager`/`Util` names, Zod, repository interfaces and ports, domain events, CQRS, `Result<T, E>`, an application service wrapping a single call. The repo pays twice for a decision it already made. |
| `BUG` | Wrong at runtime: a non-idempotent request replayed, an unbounded page walk, a response shape guessed rather than read off the upstream serializer. A self-hosted user hits it and cannot tell why. |
| `NIT` | Naming, a comment saying what instead of why, a comment whose why about another system cites no source, a missing test for behaviour already correct. |

`AGENTS.md`'s "no abstraction before its third occurrence" and "the default direction is
subtractive" are guidance for whoever writes the code. They are not predicates a review can settle,
so they are no tier.

## 3. GATES

`npm run lint`, `npm run typecheck`, `npm run typecheck:test`, `npm run test`, `npm run build`.
Once. A gate you did not run is `not run`, never assumed `ok`.

## Report

Always emitted, always this shape — including when everything is red. An honest open finding is the
output; a clean-looking review that suppressed one is the failure mode. IDs are `TIER/kebab-slug`,
and the slug names the defect rather than the place, so it survives a line shift.

```
VERDICT: <blocked|changes|clean> — <n> BLOCK, <n> RULE, <n> BUG, <n> NIT; gates <n>/5 ok
REVIEWED: <sha> — <the range read>

FINDINGS
<TIER>/<slug>  <path>:<line>  <open|fixed>
  what  <one sentence>
  why   <one sentence naming the rule or the failure mode>
  fix   <one sentence, or: reported only>

DROPPED
<slug>  <one line: what it looked like, why it is not real>

GATES
lint <ok|FAIL|not run>  typecheck <>  typecheck:test <>  test <>  build <>
  <first failing line of each FAIL>

NOT REVIEWED
- <area> — <why>
```

`blocked` on any BLOCK or failing gate, `changes` on any RULE or BUG, otherwise `clean`.

`DROPPED` is one line each and no verification narrative. A candidate that took a network call, a
live service or a planted config to settle was not dropped — that work does not persist into the
next session, so it belongs in `NOT REVIEWED` instead.

Each finding also goes on the diff itself — inline, at its line, via Conductor's DiffComment tool
when reviewing in Conductor, or as a review comment when reviewing a PR by hand. The report is the
summary; the inline comment is what the person fixing it actually reads. Nothing is posted to GitHub
unless asked.

Empty sections read `none` — except `NOT REVIEWED`, which is mandatory and names what could not be
checked: no live Paperless instance, an untested API version, the n8n runtime, a skipped gate, a
file skimmed. That section is why this protocol never has to claim completeness.

## Three rounds, then a decision

Round 3 is the last review of a branch. Whatever is still open then becomes an issue or ships — a
person decides, and only a person can: "ship it with these three open" is not a verdict this
protocol produces. The round cap is the backstop for the case where the shrinking scope is not
enough.

## What the bound does not buy

Recall is uncheckable from inside: a missed BLOCK and a genuinely clean diff produce the identical
report. CODEOWNERS, CI and the post-release scanner are the real net.
